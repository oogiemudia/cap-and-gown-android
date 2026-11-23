package io.github.oogiemudia.capgown;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;

/**
 * Speak: turns what you say into text, using the phone's own speech recogniser (the one behind the
 * microphone key on the keyboard). The phone listens for one sentence or so at a time, so this starts it
 * again after each one, until you tap Stop or it has been quiet for a while. Everything runs on the main thread.
 *
 * It reports through Callback: "ready" (listening now), "partial" (the words so far, still changing),
 * "final" (a finished piece of text) and "end" with the reason: "" (you stopped it), quiet, denied,
 * offline, mic, language, busy or none (this phone has no speech recogniser).
 *
 * A whole meeting (start(true)) is the same listening kept going for longer: it carries on through
 * pauses until nobody has been heard for ten minutes, and when the signal or the recogniser drops out
 * it says "wait" with the reason and keeps trying. Only words are passed on. No sound is kept.
 */
final class Dictation implements RecognitionListener {

    interface Callback {
        void onDictate(String kind, String text);
    }

    private static final int MAX_QUIET = 8;                 // rounds in a row with nothing said
    private static final int MAX_RETRIES = 3;
    private static final long RESTART_MS = 200;             // a breath between one sentence and the next round
    private static final long MAX_MS = 20 * 60 * 1000L;     // in case it is left on by mistake
    private static final long MEETING_MAX_MS = 90 * 60 * 1000L;   // a whole mentor meeting, with room to spare
    private static final long MEETING_QUIET_MS = 10 * 60 * 1000L; // nobody heard for this long: the meeting is over
    private static final long MEETING_WAIT_MS = 5000;             // between tries when the signal or the recogniser drops out
    private static final int ERROR_LANGUAGE_NOT_SUPPORTED = 12; // SpeechRecognizer, Android 12 and later
    private static final int ERROR_LANGUAGE_UNAVAILABLE = 13;

    private final Context context;
    private final Callback out;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private boolean active;
    private boolean stopping;
    private boolean inRound;   // the phone is listening now, so an answer is still to come
    private boolean offline;
    private boolean anyLanguage;
    private boolean meeting;
    private long lastHeard;
    private int quiet;
    private int retries;
    private String partial = "";

    private final Runnable listen = this::listen;
    private final Runnable giveUp = () -> {
        flush();
        finish("");
    };
    private final Runnable tooLong = this::stop;

    Dictation(Context context, Callback out) {
        this.context = context;
        this.out = out;
    }

    static boolean available(Context c) {
        try {
            return SpeechRecognizer.isRecognitionAvailable(c);
        } catch (Exception e) {
            return false;
        }
    }

    boolean active() {
        return active;
    }

    void start() {
        start(false);
    }

    /** wholeMeeting: keep listening through pauses, for a mentor meeting, instead of a few sentences. */
    void start(boolean wholeMeeting) {
        if (active) {
            if (wholeMeeting && !meeting) { // a short dictation turns into a meeting: give it the longer limits
                meeting = true;
                lastHeard = SystemClock.elapsedRealtime();
                handler.removeCallbacks(tooLong);
                handler.postDelayed(tooLong, MEETING_MAX_MS);
            }
            out.onDictate("ready", ""); // already listening (the page was redrawn): say so again
            return;
        }
        if (!available(context)) {
            out.onDictate("end", "none");
            return;
        }
        active = true;
        stopping = false;
        inRound = false;
        offline = false;
        anyLanguage = false;
        quiet = 0;
        retries = 0;
        partial = "";
        meeting = wholeMeeting;
        lastHeard = SystemClock.elapsedRealtime();
        handler.postDelayed(tooLong, meeting ? MEETING_MAX_MS : MAX_MS);
        listen();
    }

    /** Stops listening and keeps what was heard. The last words arrive just after. */
    void stop() {
        if (!active || stopping) return;
        handler.removeCallbacks(listen);
        if (!inRound || recognizer == null) {
            flush();
            finish("");
            return;
        }
        stopping = true;
        try {
            recognizer.stopListening();
        } catch (Exception ignored) { }
        handler.postDelayed(giveUp, 1500);
    }

    /** Stops at once (the app is leaving the screen). Words heard so far are kept. */
    void cancel() {
        if (!active) return;
        flush();
        finish("");
    }

    private void listen() {
        if (!active) return;
        if (stopping) {
            finish("");
            return;
        }
        try {
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(context);
                recognizer.setRecognitionListener(this);
            }
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.getPackageName())
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    // Hints only: a longer pause before the phone decides a sentence is over, and punctuation
                    // where the phone can add it (Android 13 and later).
                    .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                    .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                    .putExtra("android.speech.extra.ENABLE_FORMATTING", "quality");
            if (!anyLanguage) i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-GB");
            if (offline) i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            recognizer.startListening(i);
            inRound = true;
        } catch (SecurityException e) {
            finish("denied");
        } catch (Exception e) {
            finish("mic");
        }
    }

    private void again(long after) {
        if (!active) return;
        if (stopping) {
            finish("");
            return;
        }
        handler.removeCallbacks(listen);
        handler.postDelayed(listen, after);
    }

    /** Quiet for too long: a few rounds for a dictation, ten minutes for a meeting. */
    private boolean tooQuiet() {
        return meeting ? SystemClock.elapsedRealtime() - lastHeard >= MEETING_QUIET_MS : quiet >= MAX_QUIET;
    }

    private void noteHeard() {
        quiet = 0;
        lastHeard = SystemClock.elapsedRealtime();
    }

    /** A new recogniser, for when the old one is stuck. */
    private void renew() {
        if (recognizer == null) return;
        try {
            recognizer.destroy();
        } catch (Exception ignored) { }
        recognizer = null;
    }

    /** Words that were heard but never confirmed are kept rather than lost. */
    private boolean flush() {
        if (partial.isEmpty()) return false;
        String t = partial;
        partial = "";
        out.onDictate("final", t);
        return true;
    }

    private void finish(String why) {
        if (!active) return;
        active = false;
        stopping = false;
        inRound = false;
        handler.removeCallbacksAndMessages(null);
        renew();
        out.onDictate("end", why);
    }

    private static String first(Bundle b) {
        if (b == null) return "";
        ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (list == null || list.isEmpty() || list.get(0) == null) return "";
        return list.get(0).trim();
    }

    @Override
    public void onReadyForSpeech(Bundle params) {
        retries = 0;
        if (active && !stopping) out.onDictate("ready", "");
    }

    @Override
    public void onPartialResults(Bundle b) {
        if (!active) return;
        String t = first(b);
        // Google's recogniser sends the words it is still unsure of separately.
        ArrayList<String> unsure = b == null ? null : b.getStringArrayList("android.speech.extra.UNSTABLE_TEXT");
        if (unsure != null && !unsure.isEmpty() && unsure.get(0) != null && !unsure.get(0).trim().isEmpty()) {
            t = (t + " " + unsure.get(0).trim()).trim();
        }
        if (t.isEmpty()) return;
        partial = t;
        lastHeard = SystemClock.elapsedRealtime();
        out.onDictate("partial", t);
    }

    @Override
    public void onResults(Bundle b) {
        if (!active) return;
        inRound = false;
        String t = first(b);
        if (t.isEmpty()) t = partial;
        partial = "";
        if (t.isEmpty()) {
            quiet++;
        } else {
            noteHeard();
            retries = 0;
            out.onDictate("final", t);
        }
        if (tooQuiet()) finish("quiet");
        else again(RESTART_MS);
    }

    @Override
    public void onError(int code) {
        if (!active) return;
        inRound = false;
        boolean heard = flush();
        if (stopping) {
            finish("");
            return;
        }
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                if (heard) noteHeard();
                else quiet++;
                if (tooQuiet()) finish("quiet");
                else again(RESTART_MS);
                break;
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                finish("denied");
                break;
            case SpeechRecognizer.ERROR_AUDIO:
                finish("mic");
                break;
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
                // No signal: try once more with the speech the phone can recognise by itself.
                if (!offline) {
                    offline = true;
                    renew();
                    again(300);
                } else if (meeting && !tooQuiet()) {
                    // The signal dropped in the middle of a meeting: say so and keep trying.
                    offline = false;
                    renew();
                    out.onDictate("wait", "offline");
                    again(MEETING_WAIT_MS);
                } else {
                    finish("offline");
                }
                break;
            case ERROR_LANGUAGE_NOT_SUPPORTED:
            case ERROR_LANGUAGE_UNAVAILABLE:
                // British English is not set up on this phone: use the phone's own language instead.
                if (!anyLanguage) {
                    anyLanguage = true;
                    renew();
                    again(300);
                } else {
                    finish("language");
                }
                break;
            default:
                // Busy, or the recogniser dropped out: start a fresh one a few times before giving up,
                // the last time in the phone's own language in case British English was the trouble.
                if (++retries <= MAX_RETRIES) {
                    if (retries == MAX_RETRIES) anyLanguage = true;
                    renew();
                    again(500);
                } else if (meeting && !tooQuiet()) {
                    retries = 0;
                    renew();
                    out.onDictate("wait", "busy");
                    again(MEETING_WAIT_MS);
                } else {
                    finish("busy");
                }
        }
    }

    @Override
    public void onBeginningOfSpeech() { }

    @Override
    public void onRmsChanged(float rms) { }

    @Override
    public void onBufferReceived(byte[] buffer) { }

    @Override
    public void onEndOfSpeech() { }

    @Override
    public void onEvent(int type, Bundle params) { }
}
