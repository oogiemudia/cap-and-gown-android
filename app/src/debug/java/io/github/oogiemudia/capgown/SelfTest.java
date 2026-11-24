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
 * and the app's own video player (VideoActivity), which needs YouTube itself:
 *
 *   screen:    the video screen with a stand-in for YouTube's player (no connection needed): closed part of the
 *              way through it leaves the place and the length, and at the end it closes itself and leaves "ended".
 *   video:     a YouTube lesson plays in the player, the player says how long it is and where it has got to,
 *              and when the video ends the screen closes and leaves "ended" for the planner.
 *   lengths:   every YouTube lesson in the library is asked for in the player, and its length goes in the log.
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
                else if ("screen".equals(what)) screen();
                else if ("video".equals(what)) video(getIntent().getStringExtra("video"));
                else if ("lengths".equals(what)) lengths(getIntent().getStringExtra("videos"));
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

    // ---- A YouTube lesson plays in the app's own player ----

    private boolean online() throws InterruptedException {
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
        return online;
    }

    private void play(String id, String video, int start) {
        runOnUiThread(() -> startActivity(new android.content.Intent(this, VideoActivity.class)
                .putExtra(VideoActivity.EXTRA_ID, id)
                .putExtra(VideoActivity.EXTRA_VIDEO, video)
                .putExtra(VideoActivity.EXTRA_TITLE, "Self test")
                .putExtra(VideoActivity.EXTRA_START, start)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)));
    }

    private static org.json.JSONObject said() {
        try {
            String s = VideoActivity.last;
            return s == null || s.isEmpty() ? null : new org.json.JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- The video screen's own part, with a stand-in for YouTube's player ----

    /** A page that behaves as the player's page does: it is ready, plays from a place, and ends. */
    private static String standIn(int start, int length) {
        return "<!doctype html><html><body style=\"background:#000;color:#fff;font:16px sans-serif;padding:24px\">A stand-in for the player<script>"
                + "var S={ready:0,st:-2,t:0,d:0,err:0};window.__s=S;var player={pauseVideo:function(){if(S.st===1)S.st=2}};"
                + "setTimeout(function(){S.ready=1;S.d=" + length + ";S.t=" + start + ";S.st=1},800);"
                + "setInterval(function(){if(S.st===1){S.t+=0.5;if(S.t>=S.d){S.t=S.d;S.st=0}}},500);"
                + "</script></body></html>";
    }

    private void screen() throws Exception {
        VideoActivity.take(this);

        // 1. Closed part of the way through: the place and the length are left, and it is not called finished.
        VideoActivity.testPage = standIn(5, 60);
        play("selftest-part", "aaaaaaaaaaa", 5);
        org.json.JSONObject o = null;
        long t0 = SystemClock.elapsedRealtime();
        while (SystemClock.elapsedRealtime() - t0 < 30000) {
            Thread.sleep(500);
            org.json.JSONObject now = said();
            if (now == null || !"selftest-part".equals(now.optString("id"))) continue;
            o = now;
            if (o.optInt("state", -2) == 1 && o.optDouble("t", 0) >= 9) break;
        }
        say("screen, part way: " + (o == null ? "nothing was said" : o.toString()));
        // closed, as the Close button closes it
        runOnUiThread(() -> startActivity(new android.content.Intent(this, SelfTest.class).putExtra("what", "none").addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)));
        t0 = SystemClock.elapsedRealtime();
        while (said() != null && SystemClock.elapsedRealtime() - t0 < 12000) Thread.sleep(500);
        String left = VideoActivity.take(this);
        say("screen, part way: left for the planner: " + left);
        org.json.JSONObject r = left.isEmpty() ? null : new org.json.JSONObject(left);
        boolean part = r != null && "selftest-part".equals(r.optString("id")) && !r.optBoolean("ended", true) && !r.optBoolean("page", true)
                && r.optDouble("t", 0) >= 9 && r.optDouble("t", 0) < 45 && r.optDouble("d", 0) == 60;
        Thread.sleep(1500);
        boolean once = VideoActivity.take(this).isEmpty(); // collected once, and the closed screen writes nothing more

        // 2. Played to the end: the screen closes itself and leaves "ended" for the planner.
        VideoActivity.testPage = standIn(12, 20);
        play("selftest-end", "aaaaaaaaaaa", 12);
        boolean opened = false;
        t0 = SystemClock.elapsedRealtime();
        while (SystemClock.elapsedRealtime() - t0 < 45000) {
            Thread.sleep(500);
            org.json.JSONObject now = said();
            boolean mine = now != null && "selftest-end".equals(now.optString("id"));
            if (mine) opened = true;
            if (opened && !mine) break; // the screen has closed itself
        }
        long took = SystemClock.elapsedRealtime() - t0;
        left = VideoActivity.take(this);
        VideoActivity.testPage = null;
        say("screen, to the end: closed after " + took / 1000 + " s; left for the planner: " + left);
        r = left.isEmpty() ? null : new org.json.JSONObject(left);
        boolean end = opened && took < 40000 && r != null && "selftest-end".equals(r.optString("id")) && r.optBoolean("ended", false)
                && r.optDouble("t", 0) == 20 && r.optDouble("d", 0) == 20;
        say(part && once && end ? "SELFTEST PASS screen: closed part way it left the place and the length, and at the end it closed itself and left \"ended\""
                : "SELFTEST FAIL screen: part way " + part + ", collected once " + once + ", the end " + end);
    }

    private void video(String video) throws Exception {
        say("phone: Android " + android.os.Build.VERSION.RELEASE + ", web view " + webView());
        if (!VideoActivity.isVideoId(video)) {
            say("SELFTEST FAIL video: no video was named");
            return;
        }
        if (!online()) {
            say("SELFTEST SKIP video: the emulator has no connection");
            return;
        }
        VideoActivity.take(this);

        // 1. From the start: the player answers, gives the length, and the place moves on.
        VideoActivity.holdOnError = true; // an error stays on the screen, so the check can read what the player says
        play("selftest-start", video, 0);
        org.json.JSONObject o = null;
        double first = -1;
        double far = 0;
        String seen = "";
        long t0 = SystemClock.elapsedRealtime();
        while (SystemClock.elapsedRealtime() - t0 < 90000) {
            Thread.sleep(1000);
            org.json.JSONObject now = said();
            if (now == null || !"selftest-start".equals(now.optString("id"))) continue;
            o = now;
            String st = String.valueOf(o.optInt("state", -2));
            if (!seen.endsWith(st)) seen += (seen.isEmpty() ? "" : ",") + st;
            double t = o.optDouble("t", 0);
            if (t > 0 && first < 0) first = t;
            far = Math.max(far, t);
            if (o.optBoolean("page", false) || o.optInt("error", 0) != 0) break;
            if (o.optBoolean("ready", false) && o.optDouble("d", 0) > 0 && first >= 0 && far - first >= 4) break;
        }
        say("video, from the start: " + (o == null ? "nothing was said" : o.toString()) + "; states " + seen + "; moved " + Math.round(far - Math.max(0, first)) + " s");
        if (o == null) {
            say("SELFTEST FAIL video: the video screen did not start");
            return;
        }
        int error = o.optInt("error", 0);
        if (error == 153) {
            say("SELFTEST FAIL video: YouTube did not accept the app's name (error 153)");
            return;
        }
        if (error != 0) {
            // The error stays on the screen for the check to read. Then the same video the way the app does it:
            // YouTube's own page takes over, and the check reads that screen too.
            say("VIDEO HELD: the player gave error " + error + ", which stays on the screen for 25 seconds");
            Thread.sleep(25000);
            VideoActivity.holdOnError = false;
            play("selftest-page", video, 0);
            boolean shown = false;
            long p0 = SystemClock.elapsedRealtime();
            while (!shown && SystemClock.elapsedRealtime() - p0 < 40000) {
                Thread.sleep(1000);
                org.json.JSONObject now = said();
                shown = now != null && "selftest-page".equals(now.optString("id")) && now.optBoolean("page", false);
            }
            if (shown) Thread.sleep(15000); // YouTube's page loads
            say("SELFTEST SKIP video: the player could not play here (error " + error + "); YouTube's own page " + (shown ? "was shown instead" : "was not shown"));
            return;
        }
        if (o.optBoolean("page", false)) {
            say("SELFTEST SKIP video: the player did not answer in time, so YouTube's own page was shown");
            return;
        }
        double length = o.optDouble("d", 0);
        if (!o.optBoolean("ready", false) || length <= 0) {
            say("SELFTEST SKIP video: the player did not give the video's length on this emulator");
            return;
        }
        if (first < 0 || far - first < 4) {
            say("SELFTEST SKIP video: the player answered (length " + Math.round(length) + " s) but the video did not play on this emulator");
            return;
        }

        // 2. Near the end: the player says it ended, the screen closes, and "ended" is left for the planner.
        VideoActivity.take(this);
        play("selftest-end", video, (int) Math.max(0, length - 8));
        String left = "";
        t0 = SystemClock.elapsedRealtime();
        boolean reopened = false;
        while (SystemClock.elapsedRealtime() - t0 < 90000) {
            Thread.sleep(1000);
            org.json.JSONObject now = said();
            boolean mine = now != null && "selftest-end".equals(now.optString("id"));
            if (mine) reopened = true;
            if (reopened && !mine) break; // the screen has closed
        }
        left = VideoActivity.take(this);
        say("video, near the end: left for the planner: " + left);
        org.json.JSONObject r = left.isEmpty() ? null : new org.json.JSONObject(left);
        boolean ok = r != null && r.optBoolean("ended", false) && "selftest-end".equals(r.optString("id")) && r.optDouble("d", 0) > 0 && Math.abs(r.optDouble("t", 0) - r.optDouble("d", 0)) < 2;
        say(ok ? "SELFTEST PASS video: it played, gave its length (" + Math.round(length) + " s), ended, and closed"
                : "SELFTEST FAIL video: it played, but the end was not noticed");
    }

    private void lengths(String videos) throws Exception {
        say("phone: Android " + android.os.Build.VERSION.RELEASE + ", web view " + webView());
        if (videos == null || videos.isEmpty() || !online()) {
            say("SELFTEST SKIP lengths: " + (videos == null || videos.isEmpty() ? "no videos were named" : "the emulator has no connection"));
            return;
        }
        int known = 0;
        int asked = 0;
        int played = 0;
        int refused = 0;
        VideoActivity.holdOnError = true;
        for (String v : videos.split(",")) {
            v = v.trim();
            if (!VideoActivity.isVideoId(v)) continue;
            asked++;
            play("selftest-length", v, 0);
            org.json.JSONObject o = null;
            long t0 = SystemClock.elapsedRealtime();
            boolean mine = false;
            while (SystemClock.elapsedRealtime() - t0 < 30000) {
                Thread.sleep(500);
                org.json.JSONObject now = said();
                if (now == null || !v.equals(now.optString("v"))) continue;
                mine = true;
                o = now;
                if (o.optDouble("d", 0) > 0 || o.optBoolean("page", false) || o.optInt("error", 0) != 0) break;
            }
            // The length is known as soon as the player answers. Whether the video then plays takes a few seconds more.
            long t1 = SystemClock.elapsedRealtime();
            while (o != null && o.optInt("error", 0) == 0 && !o.optBoolean("page", false) && o.optDouble("t", 0) <= 0 && SystemClock.elapsedRealtime() - t1 < 8000) {
                Thread.sleep(500);
                org.json.JSONObject now = said();
                if (now != null && v.equals(now.optString("v"))) o = now;
            }
            double d = o == null ? 0 : o.optDouble("d", 0);
            if (d > 0) known++;
            int err = o == null ? 0 : o.optInt("error", 0);
            boolean plays = o != null && err == 0 && o.optDouble("t", 0) > 0;
            if (plays) played++;
            if (err != 0) refused++;
            say("VIDEO LENGTH " + v + " " + (d > 0 ? Math.round(d) + " s" : "not known (" + (o == null ? (mine ? "nothing said" : "the screen did not start") : "ready " + o.optBoolean("ready", false) + ")"))
                    + (o == null ? "" : plays ? ", plays" : err != 0 ? ", error " + err : ", did not start (state " + o.optInt("state", -2) + ")"));
            // Three lessons with no answer: the player does not work on this emulator, so the rest would only waste minutes.
            if (asked >= 3 && known == 0) {
                say("the first three lessons gave no length, so the rest are not asked for");
                break;
            }
        }
        runOnUiThread(() -> startActivity(new android.content.Intent(this, SelfTest.class).putExtra("what", "none").addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)));
        say("SELFTEST DONE lengths: " + known + " of " + asked + " lessons gave a length, " + played + " played, " + refused + " gave an error");
    }

    private String webView() {
        try {
            android.content.pm.PackageInfo p = android.webkit.WebView.getCurrentWebViewPackage();
            return p == null ? "none" : p.packageName + " " + p.versionName;
        } catch (Throwable e) {
            return "not known";
        }
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
