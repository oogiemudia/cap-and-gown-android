package io.github.oogiemudia.capgown;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import ai.moonshine.voice.JNI;
import ai.moonshine.voice.TranscriberOption;
import ai.moonshine.voice.Transcript;
import ai.moonshine.voice.TranscriptLine;

/**
 * The app's own listening, for a mentor meeting: the app opens the microphone itself and turns the sound
 * into words on the phone, with a speech model that was downloaded once (SpeechModel). Unlike the phone's
 * speech service (Dictation), it does not depend on another app, so it carries on with the phone locked,
 * under the meeting's notice (MeetingService), and no sound leaves the phone. No sound is saved either:
 * the sound is held for a moment in memory and only the words are passed on.
 *
 * It reports through the same Callback as Dictation: "ready" with the text "own", "partial" (the sentence
 * so far, still changing), "final" (a finished sentence) and "end" with the reason: "" (it was stopped),
 * quiet (nobody heard for ten minutes), mic (the microphone could not be opened, or was taken away) or
 * engine (the speech model would not start).
 */
final class OwnSpeech {

    /** Where the sound comes from: the microphone, or a recording in a test. */
    interface Source {
        /** Opens it and returns the samples a second, or -1 if it could not be opened. */
        int open();

        /** Fills buf: the number of samples read, 0 for none yet, -1 for a fault, -2 at the end. */
        int read(short[] buf);

        void close();
    }

    private static final long MAX_MS = 95 * 60 * 1000L;        // the page stops a meeting at ninety minutes itself
    private static final long QUIET_MS = 10 * 60 * 1000L;      // nobody heard for this long: the meeting is over
    private static final long RENEW_MS = 4 * 60 * 1000L;       // start the engine's transcript afresh at a pause
    private static final long RENEW_HARD_MS = 8 * 60 * 1000L;  // or without one
    private static final int MAX_WAITING = 1200;               // tenths of a second of sound waiting to be heard
    private static final double PASS_ON_SCREEN = 1.0;          // seconds of sound between looks for new words
    private static final double PASS_OFF_SCREEN = 2.5;

    private final Context app;
    private final Dictation.Callback out;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean active;
    private volatile boolean stop;
    private volatile boolean hidden;
    private volatile long samples; // of sound taken from the microphone since listening began
    private int session;

    OwnSpeech(Context context, Dictation.Callback out) {
        this.app = context.getApplicationContext();
        this.out = out;
    }

    boolean active() {
        return active;
    }

    /** How much sound has come from the microphone since listening began, in samples. The test build reads it. */
    long samples() {
        return samples;
    }

    /** Off the screen nobody is watching the words arrive, so it looks for them less often. */
    void background(boolean off) {
        hidden = off;
    }

    /** Starts listening with the model of this size. source is null for the microphone. Main thread. */
    void start(String key, Source source) {
        if (active) {
            out.onDictate("ready", "own"); // already listening (the page was redrawn): say so again
            return;
        }
        active = true;
        stop = false;
        samples = 0;
        final int my = ++session;
        final Source src = source != null ? source : new Mic();
        Thread t = new Thread(() -> run(my, key, src), "own-speech");
        t.setDaemon(true);
        t.start();
    }

    /** Stops listening and keeps what was heard. The last words arrive just after, then "end". */
    void stop() {
        stop = true;
    }

    private void tell(int my, String kind, String text) {
        main.post(() -> {
            if (my != session) return;
            if ("end".equals(kind)) {
                if (!active) return;
                active = false;
            }
            out.onDictate(kind, text);
        });
    }

    private void run(int my, String key, Source src) {
        String why = "";
        int handle = -1;
        int stream = -1;
        try {
            JNI.ensureLibraryLoaded();
            handle = JNI.moonshineLoadTranscriberFromFiles(SpeechModel.dir(app, key).getAbsolutePath(), SpeechModel.arch(key),
                    new TranscriberOption[]{new TranscriberOption("return_audio_data", "false")});
            if (handle < 0) throw new IllegalStateException("model");
            stream = JNI.moonshineCreateStream(handle, 0);
            if (stream < 0) throw new IllegalStateException("stream");
            if (JNI.moonshineStartStream(handle, stream) != JNI.MOONSHINE_ERROR_NONE) throw new IllegalStateException("start");
        } catch (Throwable e) {
            why = "engine";
        }
        if (why.isEmpty() && !stop) {
            // The microphone is opened only now, so that no sound piles up while the model loads.
            int rate = -1;
            try {
                rate = src.open();
            } catch (Throwable ignored) { }
            if (rate <= 0) {
                why = "mic";
            } else {
                try {
                    why = listen(my, handle, stream, src, rate);
                } catch (Throwable e) {
                    why = "engine";
                }
            }
        }
        try {
            src.close();
        } catch (Throwable ignored) { }
        try {
            if (stream >= 0) JNI.moonshineFreeStream(handle, stream);
            if (handle >= 0) JNI.moonshineFreeTranscriber(handle);
        } catch (Throwable ignored) { }
        tell(my, "end", why);
    }

    /** Listens until it is stopped, falls quiet or fails. Returns the reason it ended. */
    private String listen(int my, int handle, int stream, Source src, int rate) throws InterruptedException {
        final LinkedBlockingQueue<float[]> waiting = new LinkedBlockingQueue<>();
        final AtomicInteger state = new AtomicInteger(0); // 0 capturing, 1 asked to stop, -1 fault, -2 the source ended
        Thread capture = new Thread(() -> {
            short[] buf = new short[Math.max(160, rate / 10)];
            while (state.get() == 0) {
                int n;
                try {
                    n = src.read(buf);
                } catch (Throwable e) {
                    n = -1;
                }
                if (n > 0) {
                    samples += n;
                    float[] f = new float[n];
                    for (int i = 0; i < n; i++) f[i] = buf[i] / 32768f;
                    waiting.offer(f);
                    if (waiting.size() > MAX_WAITING) waiting.poll(); // far behind: let the oldest sound go
                } else if (n == 0) {
                    try {
                        Thread.sleep(10);
                    } catch (InterruptedException e) {
                        break;
                    }
                } else {
                    state.compareAndSet(0, n == -2 ? -2 : -1);
                }
            }
        }, "own-speech-mic");
        capture.setDaemon(true);
        capture.start();
        tell(my, "ready", "own");

        String why = "";
        final HashSet<Long> finished = new HashSet<>();
        final long started = SystemClock.elapsedRealtime();
        long lastHeard = started;
        long streamAt = started;
        double pending = 0;
        double lastPass = 0;
        try {
            while (!stop) {
                float[] a = take(waiting);
                long now = SystemClock.elapsedRealtime();
                if (a == null) {
                    int s = state.get();
                    if (s == -1) {
                        why = "mic";
                        break;
                    }
                    if (s == -2) break; // a recording has been heard to its end
                } else {
                    if (JNI.moonshineAddAudioToStream(handle, stream, a, rate, 0) != JNI.MOONSHINE_ERROR_NONE) return "engine";
                    pending += a.length / (double) rate;
                    // A look for new words has to cover at least as much sound as the last look took,
                    // so a slow phone looks less often instead of falling further and further behind.
                    double floor = hidden ? PASS_OFF_SCREEN : PASS_ON_SCREEN;
                    if (pending >= Math.min(Math.max(floor, lastPass), floor * 10)) {
                        pending = 0;
                        long t0 = System.nanoTime();
                        Transcript t = JNI.moonshineTranscribeStream(handle, stream, 0);
                        lastPass = (System.nanoTime() - t0) / 1e9;
                        if (t == null) return "engine";
                        int got = report(my, t, finished);
                        if ((got & 1) != 0) lastHeard = now;
                        // The engine keeps the whole transcript of a session. Starting it afresh now and then,
                        // at a pause where it can, keeps a long meeting from growing without end.
                        boolean open = (got & 2) != 0;
                        if (now - streamAt >= RENEW_HARD_MS || (now - streamAt >= RENEW_MS && !open)) {
                            if ((flush(my, handle, stream, finished) & 1) != 0) lastHeard = now;
                            if (JNI.moonshineStartStream(handle, stream) != JNI.MOONSHINE_ERROR_NONE) return "engine";
                            streamAt = now;
                        }
                    }
                }
                if (now - lastHeard >= QUIET_MS) {
                    why = "quiet";
                    break;
                }
                if (now - started >= MAX_MS) break;
            }
        } finally {
            state.compareAndSet(0, 1);
            capture.join(1500);
        }
        // What was said just before Pause or Finish is still waiting: hear it out, then take the last words.
        float[] rest;
        while ((rest = waiting.poll()) != null) {
            if (JNI.moonshineAddAudioToStream(handle, stream, rest, rate, 0) != JNI.MOONSHINE_ERROR_NONE) return "engine";
        }
        flush(my, handle, stream, finished);
        return why;
    }

    /** The sound that is waiting, as one piece (up to about five seconds of it), or null after a short wait. */
    private static float[] take(LinkedBlockingQueue<float[]> waiting) throws InterruptedException {
        float[] first = waiting.poll(250, TimeUnit.MILLISECONDS);
        if (first == null || waiting.isEmpty()) return first;
        List<float[]> parts = new ArrayList<>();
        parts.add(first);
        int length = first.length;
        float[] next;
        while (parts.size() < 50 && (next = waiting.poll()) != null) {
            parts.add(next);
            length += next.length;
        }
        float[] all = new float[length];
        int at = 0;
        for (float[] p : parts) {
            System.arraycopy(p, 0, all, at, p.length);
            at += p.length;
        }
        return all;
    }

    /** Ends the engine's session, which finishes the sentence being spoken, and passes on the last words. */
    private int flush(int my, int handle, int stream, HashSet<Long> finished) {
        JNI.moonshineStopStream(handle, stream);
        Transcript t = JNI.moonshineTranscribeStream(handle, stream, JNI.MOONSHINE_FLAG_FORCE_UPDATE);
        return t == null ? 0 : report(my, t, finished);
    }

    /** Passes on what is new in the transcript. Bit 1: something was heard. Bit 2: a sentence is still being spoken. */
    private int report(int my, Transcript t, HashSet<Long> finished) {
        int got = 0;
        if (t.lines == null) return 0;
        for (TranscriptLine line : t.lines) {
            if (line == null) continue;
            String text = line.text == null ? "" : line.text.trim();
            if (line.isComplete) {
                if (finished.add(line.id) && !text.isEmpty()) {
                    tell(my, "final", text);
                    got |= 1;
                }
            } else {
                got |= 2;
                if (line.hasTextChanged && !text.isEmpty()) {
                    tell(my, "partial", text);
                    got |= 1;
                }
            }
        }
        return got;
    }

    /** The phone's microphone, at the rate the speech model wants where the phone allows it. */
    private static final class Mic implements Source {
        private AudioRecord rec;

        @Override
        public int open() {
            // The setting made for speech recognition first, which leaves the sound as it is; then the plain one.
            int[] sources = {MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC};
            int[] rates = {16000, 48000, 44100};
            for (int source : sources) {
                for (int rate : rates) {
                    AudioRecord r = null;
                    try {
                        int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                        if (min <= 0) continue;
                        r = new AudioRecord(source, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
                                Math.max(min * 4, rate * 4)); // room for two seconds of sound
                        if (r.getState() == AudioRecord.STATE_INITIALIZED) {
                            r.startRecording();
                            if (r.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                                rec = r;
                                return rate;
                            }
                        }
                        r.release();
                    } catch (Throwable e) {
                        if (r != null) {
                            try {
                                r.release();
                            } catch (Throwable ignored) { }
                        }
                    }
                }
            }
            return -1;
        }

        @Override
        public int read(short[] buf) {
            AudioRecord r = rec;
            if (r == null) return -1;
            int n = r.read(buf, 0, buf.length);
            return n < 0 ? -1 : n;
        }

        @Override
        public void close() {
            AudioRecord r = rec;
            rec = null;
            if (r == null) return;
            try {
                r.stop();
            } catch (Throwable ignored) { }
            try {
                r.release();
            } catch (Throwable ignored) { }
        }
    }
}
