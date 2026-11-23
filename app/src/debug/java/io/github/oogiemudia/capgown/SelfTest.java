package io.github.oogiemudia.capgown;

import android.app.Activity;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import ai.moonshine.voice.JNI;
import ai.moonshine.voice.TranscriberOption;

/**
 * Only in the test build, which the checks run on an Android emulator. It tries the app's own listening
 * (SpeechModel, OwnSpeech) for real, which the page's test robot cannot do:
 *
 *   recording: the engine loads, its speech model downloads, and a recording of speech comes out as words.
 *   mic:       under the meeting's notice the microphone keeps giving sound after the screen goes off.
 *
 * Started by the check with: am start -n io.github.oogiemudia.capgown/.SelfTest --es what recording
 * It writes what it finds to the log under "CapGownSelfTest", ending with SELFTEST PASS, FAIL or SKIP.
 */
public final class SelfTest extends Activity {

    private static final String TAG = "CapGownSelfTest";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String w = getIntent().getStringExtra("what");
        String s = getIntent().getStringExtra("size");
        final String what = w == null ? "recording" : w;
        final String size = s == null ? "tiny" : s;
        Thread t = new Thread(() -> {
            try {
                if ("mic".equals(what)) mic(size);
                else recording(size);
            } catch (Throwable e) {
                Log.e(TAG, "SELFTEST FAIL " + what + ": " + Log.getStackTraceString(e));
            }
        }, "self-test");
        t.start();
    }

    private static void say(String line) {
        // The log cuts long lines short, so long ones go out in pieces.
        for (int i = 0; i < line.length(); i += 900) Log.i(TAG, line.substring(i, Math.min(line.length(), i + 900)));
    }

    // ---- A recording comes out as words ----

    private void recording(String size) throws Exception {
        say("phone: Android " + android.os.Build.VERSION.RELEASE + ", " + java.util.Arrays.toString(android.os.Build.SUPPORTED_ABIS));
        if (!SpeechModel.supported()) {
            say("SELFTEST FAIL recording: the engine did not load on this processor");
            return;
        }
        for (String k : SpeechModel.KEYS) {
            String list = JNI.moonshineGetSttDependencies("en",
                    new TranscriberOption[]{new TranscriberOption("model_arch", String.valueOf(SpeechModel.arch(k)))});
            say("the engine's list for " + k + ": " + list);
        }
        say("status before: " + SpeechModel.status(this));

        // An emulator that has only just started may not have its connection yet: wait for it, as a person would.
        android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        long w0 = SystemClock.elapsedRealtime();
        boolean online = false;
        while (!online && SystemClock.elapsedRealtime() - w0 < 120000) {
            android.net.Network net = cm.getActiveNetwork();
            android.net.NetworkCapabilities caps = net == null ? null : cm.getNetworkCapabilities(net);
            online = caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED);
            if (!online) Thread.sleep(1000);
        }
        say("connection after " + (SystemClock.elapsedRealtime() - w0) / 1000 + " s: " + (online ? "there" : "not there"));

        long t0 = SystemClock.elapsedRealtime();
        for (int attempt = 1; ; attempt++) {
            SpeechModel.download(this, size);
            long told = 0;
            while (SpeechModel.busy()) {
                if (SystemClock.elapsedRealtime() - t0 > 15 * 60 * 1000L) {
                    say("SELFTEST FAIL recording: the download took more than 15 minutes. " + SpeechModel.status(this));
                    return;
                }
                if (SystemClock.elapsedRealtime() - told > 5000) {
                    told = SystemClock.elapsedRealtime();
                    say("downloading: " + SpeechModel.status(this).optLong("done") + " of " + SpeechModel.status(this).optLong("total"));
                }
                Thread.sleep(250);
            }
            // A dropped connection is carried on from where it stopped, as Download does when it is tapped again.
            if (SpeechModel.ready(this, size) || !"offline".equals(SpeechModel.status(this).optString("error")) || attempt >= 6) break;
            say("the download stopped for want of a connection (try " + attempt + "): trying again in 10 s");
            Thread.sleep(10000);
        }
        say("status after " + (SystemClock.elapsedRealtime() - t0) / 1000 + " s: " + SpeechModel.status(this));
        if (!SpeechModel.ready(this, size)) {
            say("SELFTEST FAIL recording: the speech model did not download (" + SpeechModel.status(this).optString("error") + ")");
            return;
        }
        File[] got = SpeechModel.dir(this, size).listFiles();
        if (got != null) {
            for (File f : got) {
                say("on the phone: " + f.getName() + " " + f.length() + " bytes, CRC-32C "
                        + android.util.Base64.encodeToString(SpeechModel.crc32c(f), android.util.Base64.NO_WRAP));
            }
        }
        if (!size.equals(SpeechModel.inUse(this))) {
            say("SELFTEST FAIL recording: the downloaded model was not put into use");
            return;
        }

        final Wav wav = new Wav(getAssets().open("selftest.wav"));
        final List<String> finals = new ArrayList<>();
        final int[] partials = {0};
        final String[] ended = {null};
        final CountDownLatch end = new CountDownLatch(1);
        final OwnSpeech own = new OwnSpeech(this, (kind, text) -> {
            if ("final".equals(kind)) {
                finals.add(text);
                say("final: " + text);
            } else if ("partial".equals(kind)) {
                partials[0]++;
            } else if ("end".equals(kind)) {
                ended[0] = text;
                end.countDown();
            } else {
                say(kind + ": " + text);
            }
        });
        long t1 = SystemClock.elapsedRealtime();
        runOnUiThread(() -> own.start(size, wav));
        if (!end.await(10, TimeUnit.MINUTES)) {
            say("SELFTEST FAIL recording: listening to the recording did not finish in 10 minutes");
            return;
        }
        double took = (SystemClock.elapsedRealtime() - t1) / 1000.0;
        StringBuilder all = new StringBuilder();
        for (String f : finals) all.append(f).append(' ');
        String heard = all.toString().trim();
        say(String.format(Locale.ROOT, "heard %.1f s of sound in %.1f s: %d sentences, %d partial updates, ended \"%s\"",
                wav.seconds(), took, finals.size(), partials[0], ended[0]));
        say("SELFTEST TRANSCRIPT: " + heard);
        String plain = heard.toLowerCase(Locale.ROOT).replaceAll("[^a-z ]", " ").replaceAll(" +", " ");
        boolean ok = "".equals(ended[0]) && plain.contains("best of times") && plain.split(" ").length >= 40;
        say(ok ? "SELFTEST PASS recording" : "SELFTEST FAIL recording: the words do not match the recording");
    }

    /** A recording in the test build's own files, played to the engine four times as fast as it was spoken. */
    private static final class Wav implements OwnSpeech.Source {
        private final int rate;
        private final int channels;
        private final short[] pcm;
        private int at;

        Wav(InputStream in) throws Exception {
            ByteArrayOutputStream all = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) >= 0) all.write(buf, 0, n);
            in.close();
            ByteBuffer b = ByteBuffer.wrap(all.toByteArray()).order(ByteOrder.LITTLE_ENDIAN);
            if (b.remaining() < 12 || b.getInt(0) != 0x46464952 || b.getInt(8) != 0x45564157) throw new Exception("not a WAV file");
            int r = 0;
            int ch = 0;
            int bits = 0;
            short[] data = null;
            int p = 12;
            while (p + 8 <= b.limit()) {
                int id = b.getInt(p);
                int len = b.getInt(p + 4);
                int body = p + 8;
                if (len < 0 || body + len > b.limit()) len = b.limit() - body;
                if (id == 0x20746d66) { // "fmt "
                    if (b.getShort(body) != 1) throw new Exception("not plain PCM");
                    ch = b.getShort(body + 2);
                    r = b.getInt(body + 4);
                    bits = b.getShort(body + 14);
                } else if (id == 0x61746164) { // "data"
                    if (bits != 16 || ch < 1) throw new Exception("not 16 bit");
                    data = new short[len / 2];
                    for (int i = 0; i < data.length; i++) data[i] = b.getShort(body + i * 2);
                    break;
                }
                p = body + len + (len & 1);
            }
            if (data == null || r <= 0) throw new Exception("no sound in the WAV file");
            rate = r;
            channels = ch;
            pcm = data;
        }

        double seconds() {
            return pcm.length / (double) channels / rate;
        }

        @Override
        public int open() {
            return rate;
        }

        @Override
        public int read(short[] buf) {
            int frames = Math.min(buf.length, (pcm.length - at) / channels);
            if (frames <= 0) return -2;
            for (int i = 0; i < frames; i++) {
                int sum = 0;
                for (int c = 0; c < channels; c++) sum += pcm[at++];
                buf[i] = (short) (sum / channels);
            }
            try {
                Thread.sleep(Math.max(1, frames * 250L / rate));
            } catch (InterruptedException ignored) { }
            return frames;
        }

        @Override
        public void close() { }
    }

    // ---- The microphone keeps giving sound with the screen off ----

    private void mic(String size) throws Exception {
        if (!SpeechModel.ready(this, size)) {
            say("SELFTEST FAIL mic: the speech model is not on the phone (run the recording test first)");
            return;
        }
        final PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        final String[] ended = {null};
        final CountDownLatch end = new CountDownLatch(1);
        final CountDownLatch ready = new CountDownLatch(1);
        final OwnSpeech own = new OwnSpeech(this, (kind, text) -> {
            if ("ready".equals(kind)) {
                ready.countDown();
            } else if ("end".equals(kind)) {
                ended[0] = text;
                end.countDown();
                ready.countDown();
            }
            if (!"partial".equals(kind)) say(kind + ": " + text);
        });
        runOnUiThread(() -> {
            // As the app does it: its own listening, under the meeting's notice.
            own.start(size, null);
            MeetingService.start(this, own::stop);
        });
        ready.await(2, TimeUnit.MINUTES);
        if (ended[0] != null) {
            // An emulator without a microphone: nothing can be learnt here.
            say(("mic".equals(ended[0]) ? "SELFTEST SKIP mic: this emulator has no microphone to open" : "SELFTEST FAIL mic: ended \"" + ended[0] + "\""));
            runOnUiThread(MeetingService::stop);
            return;
        }
        int on = 0;      // five second spells with the screen on in which sound arrived
        int off = 0;     // the same with the screen off
        int offDry = 0;  // spells with the screen off in which no sound arrived
        long last = own.samples();
        for (int i = 1; i <= 16 && ended[0] == null; i++) {
            Thread.sleep(5000);
            long now = own.samples();
            boolean screen = pm.isInteractive();
            boolean idle = pm.isDeviceIdleMode();
            say("mic at " + (i * 5) + " s: " + (now - last) + " samples in 5 s, screen " + (screen ? "on" : "off") + (idle ? ", phone idle (doze)" : "")
                    + ", notice " + (MeetingService.running() ? "up" : "not up"));
            if (screen) {
                if (now > last) on++;
            } else if (now > last) {
                off++;
            } else {
                offDry++;
            }
            last = now;
        }
        runOnUiThread(own::stop);
        end.await(1, TimeUnit.MINUTES);
        runOnUiThread(MeetingService::stop);
        say("mic: " + on + " spells with sound and the screen on, " + off + " with the screen off, " + offDry + " with the screen off and no sound; ended \"" + ended[0] + "\"");
        if (on == 0 && off == 0) say("SELFTEST SKIP mic: the emulator's microphone opened but gave no sound at all");
        else if (off + offDry < 4) say("SELFTEST SKIP mic: the screen was not off for long enough to tell");
        else if (offDry == 0 && "".equals(ended[0])) say("SELFTEST PASS mic");
        else say("SELFTEST FAIL mic: the sound stopped with the screen off");
    }
}
