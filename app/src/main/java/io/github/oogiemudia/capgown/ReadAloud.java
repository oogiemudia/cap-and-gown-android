package io.github.oogiemudia.capgown;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Listen: reads any length of text aloud with the phone's own voice. A reading in the online library, a lesson,
 * your own notes, or text shared from another app.
 *
 * The text is cut into short parts (a sentence or two). The voice is handed a few parts at a time, so pause,
 * back, forward and speed all work at once, and the place is remembered for each text. ReadAloudService keeps
 * it going with the screen off. Everything here runs on the main thread.
 */
final class ReadAloud {

    interface Listener {
        /** The state as JSON: state (idle, playing, paused), title, i, n, rate, done, resumed, error. */
        void onListenState(String json);
    }

    static final int IDLE = 0;
    static final int PLAYING = 1;
    static final int PAUSED = 2;

    private static final String PREFS = "capgown-listen";
    private static final int SOFT = 280;      // a part grows to about this many letters
    private static final int HARD = 900;      // and is never longer than this
    private static final int MAX_PARTS = 20000;
    private static final int AHEAD = 2;       // parts handed to the voice beyond the one being spoken
    private static final int KEEP_PLACES = 30;
    private static final Pattern SENTENCE = Pattern.compile("[^.!?…]+[.!?…]+[\"'”’)\\]]*\\s*|[^.!?…]+$");

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final List<Listener> listeners = new ArrayList<>();

    private static Context app;
    private static TextToSpeech tts;
    private static boolean ttsReady;
    private static volatile List<String> parts = new ArrayList<>();
    private static volatile String title = "";
    private static String key = "";
    private static volatile int index; // the part being spoken, or the next one to speak
    private static int queued;       // parts from index up to here are with the voice
    private static volatile int state = IDLE;
    private static int session;      // goes up each time speech starts again, so late callbacks are ignored
    private static int failures;
    private static float rate = -1f;
    private static boolean done;
    private static boolean resumed;
    private static boolean pausedByFocus;
    private static String error = "";
    private static AudioFocusRequest focus;
    private static PowerManager.WakeLock wake;

    private ReadAloud() { }

    private static void onMain(Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) r.run();
        else MAIN.post(r);
    }

    static void addListener(Listener l) {
        onMain(() -> {
            if (!listeners.contains(l)) listeners.add(l);
        });
    }

    static void removeListener(Listener l) {
        onMain(() -> listeners.remove(l));
    }

    static int state() {
        return state;
    }

    /** Called when the app opens, so the reading speed you chose last time is known before anything plays. */
    static void init(Context c) {
        final Context appContext = c.getApplicationContext();
        onMain(() -> {
            if (app == null) app = appContext;
            if (rate < 0) rate = prefs().getFloat("rate", 1f);
        });
    }

    /** Cuts text into parts short enough to pause and skip between. */
    static List<String> split(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        String t = text.replace(' ', ' ').replaceAll("[\\t\\x0B\\f\\r]+", " ");
        for (String para : t.split("\\n+")) {
            String p = para.trim().replaceAll(" {2,}", " ");
            if (p.isEmpty()) continue;
            StringBuilder cur = new StringBuilder();
            Matcher m = SENTENCE.matcher(p);
            while (m.find()) {
                String s = m.group().trim();
                if (s.isEmpty()) continue;
                if (cur.length() > 0 && cur.length() + 1 + s.length() > SOFT) {
                    addPart(out, cur.toString());
                    cur.setLength(0);
                }
                if (cur.length() > 0) cur.append(' ');
                cur.append(s);
            }
            if (cur.length() > 0) addPart(out, cur.toString());
            if (out.size() >= MAX_PARTS) break;
        }
        return out;
    }

    private static void addPart(List<String> out, String s) {
        // A very long sentence (a list, a table) is cut at a space.
        while (s.length() > HARD) {
            int cut = s.lastIndexOf(' ', HARD);
            if (cut < HARD / 2) cut = HARD;
            String head = s.substring(0, cut).trim();
            if (speakable(head)) out.add(head);
            s = s.substring(cut).trim();
        }
        if (speakable(s)) out.add(s);
    }

    private static boolean speakable(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.isLetterOrDigit(s.charAt(i))) return true;
        }
        return false;
    }

    /** Starts reading. False when there is nothing in the text to read. */
    static boolean play(Context c, String name, String text) {
        final List<String> cut = split(text);
        if (cut.isEmpty()) return false;
        final Context appContext = c.getApplicationContext();
        final String label = name == null || name.trim().isEmpty() ? "Reading aloud" : name.trim();
        final String place = label + "|" + text.length() + "|" + text.hashCode();
        onMain(() -> {
            app = appContext;
            if (state != IDLE) savePlace(); // the place in whatever was being read before
            halt();
            parts = cut;
            title = label.length() > 120 ? label.substring(0, 120) : label;
            key = place;
            error = "";
            done = false;
            failures = 0;
            int saved = savedPlace(place);
            resumed = saved > 0 && saved < cut.size() - 1;
            index = resumed ? saved : 0;
            state = PLAYING;
            pausedByFocus = false;
            if (rate < 0) rate = prefs().getFloat("rate", 1f);
            ReadAloudService.start(appContext);
            takeFocus();
            holdAwake(true);
            ensureVoice();
            tell();
        });
        return true;
    }

    static void pause() {
        onMain(() -> pauseNow(false));
    }

    private static void pauseNow(boolean byFocus) {
        if (state != PLAYING) return;
        state = PAUSED;
        pausedByFocus = byFocus;
        halt();
        savePlace();
        holdAwake(false);
        if (!byFocus) dropFocus();
        tell();
    }

    static void resume() {
        onMain(() -> {
            if (state != PAUSED || app == null) return;
            state = PLAYING;
            pausedByFocus = false;
            resumed = false;
            ReadAloudService.start(app);
            takeFocus();
            holdAwake(true);
            ensureVoice();
            tell();
        });
    }

    static void toggle() {
        onMain(() -> {
            if (state == PLAYING) pauseNow(false);
            else if (state == PAUSED) resume();
        });
    }

    /** Moves by whole parts: -1 is the one before, +1 the one after. */
    static void skip(int by) {
        onMain(() -> {
            if (state == IDLE || parts.isEmpty()) return;
            index = Math.max(0, Math.min(parts.size() - 1, index + by));
            resumed = false;
            if (state == PLAYING) speakFromIndex();
            else savePlace();
            tell();
        });
    }

    static void restart() {
        onMain(() -> {
            if (state == IDLE || parts.isEmpty()) return;
            index = 0;
            resumed = false;
            if (state == PLAYING) speakFromIndex();
            else savePlace();
            tell();
        });
    }

    static void setRate(double r) {
        final float v = (float) Math.max(0.5, Math.min(2.5, r));
        onMain(() -> {
            rate = v;
            if (app != null) prefs().edit().putFloat("rate", v).apply();
            if (tts != null && ttsReady) {
                tts.setSpeechRate(v);
                if (state == PLAYING) speakFromIndex();
            }
            tell();
        });
    }

    static void stop() {
        onMain(() -> {
            if (state == IDLE) return;
            savePlace();
            finish("");
        });
    }

    private static void finish(String why) {
        state = IDLE;
        error = why == null ? "" : why;
        halt();
        if (tts != null) {
            try {
                tts.shutdown();
            } catch (Exception ignored) { }
            tts = null;
            ttsReady = false;
        }
        holdAwake(false);
        dropFocus();
        tell();
    }

    /** Stops the voice where it is. Anything it still calls back about is ignored. */
    private static void halt() {
        session++;
        queued = index;
        if (tts != null && ttsReady) {
            try {
                tts.stop();
            } catch (Exception ignored) { }
        }
    }

    private static void ensureVoice() {
        if (tts != null) {
            if (ttsReady) speakFromIndex();
            return;
        }
        ttsReady = false;
        final TextToSpeech[] made = new TextToSpeech[1];
        // Posted, never run inside the constructor: a phone with no voice answers before the constructor returns.
        made[0] = new TextToSpeech(app, status -> MAIN.post(() -> {
            if (tts != made[0]) return; // stopped before the voice was ready
            if (status != TextToSpeech.SUCCESS) {
                finish("Read aloud is not available on this phone. Check a voice is installed in the phone's Text-to-speech settings.");
                return;
            }
            try {
                int have = tts.isLanguageAvailable(Locale.UK);
                if (have >= TextToSpeech.LANG_AVAILABLE) tts.setLanguage(Locale.UK);
                tts.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
                tts.setSpeechRate(rate < 0 ? 1f : rate);
                tts.setOnUtteranceProgressListener(new Progress());
            } catch (Exception ignored) { }
            ttsReady = true;
            if (state == PLAYING) speakFromIndex();
        }));
        tts = made[0];
    }

    private static void speakFromIndex() {
        if (tts == null || !ttsReady) return;
        halt();
        fill();
    }

    /** Hands the voice the next few parts. */
    private static void fill() {
        if (state != PLAYING || tts == null || !ttsReady) return;
        while (queued < parts.size() && queued <= index + AHEAD) {
            int r;
            try {
                r = tts.speak(parts.get(queued), TextToSpeech.QUEUE_ADD, new Bundle(), session + ":" + queued);
            } catch (Exception e) {
                r = TextToSpeech.ERROR;
            }
            if (r != TextToSpeech.SUCCESS) {
                savePlace();
                finish("The phone's voice stopped. Tap Listen to carry on from the same place.");
                return;
            }
            queued++;
        }
    }

    private static final class Progress extends UtteranceProgressListener {
        @Override
        public void onStart(String id) {
            final int[] at = parse(id);
            onMain(() -> {
                if (at == null || at[0] != session || state != PLAYING) return;
                index = at[1];
                failures = 0;
                tell();
            });
        }

        @Override
        public void onDone(String id) {
            final int[] at = parse(id);
            onMain(() -> next(at));
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onError(String id) {
            final int[] at = parse(id);
            onMain(() -> {
                if (at == null || at[0] != session || state != PLAYING) return;
                if (++failures >= 3) {
                    savePlace();
                    finish("The phone's voice could not read this. Check a voice is installed in the phone's Text-to-speech settings.");
                    return;
                }
                next(at);
            });
        }

        @Override
        public void onError(String id, int code) {
            onError(id);
        }
    }

    private static void next(int[] at) {
        if (at == null || at[0] != session || state != PLAYING) return;
        if (at[1] >= parts.size() - 1) {
            forgetPlace();
            done = true;
            finish("");
            return;
        }
        index = at[1] + 1;
        resumed = false;
        if (index % 5 == 0) savePlace();
        fill();
    }

    private static int[] parse(String id) {
        if (id == null) return null;
        int c = id.indexOf(':');
        if (c < 1) return null;
        try {
            return new int[]{Integer.parseInt(id.substring(0, c)), Integer.parseInt(id.substring(c + 1))};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /* ---------- sound and power ---------- */

    private static void takeFocus() {
        if (app == null) return;
        try {
            AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (focus == null) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build())
                        .setWillPauseWhenDucked(true)
                        .setOnAudioFocusChangeListener(change -> {
                            if (change == AudioManager.AUDIOFOCUS_GAIN) {
                                if (state == PAUSED && pausedByFocus) resume();
                            } else if (change == AudioManager.AUDIOFOCUS_LOSS) {
                                pauseNow(false);
                            } else {
                                pauseNow(true); // a call, a message sound or directions: carry on afterwards
                            }
                        }, MAIN)
                        .build();
            }
            am.requestAudioFocus(focus);
        } catch (Exception ignored) { }
    }

    private static void dropFocus() {
        if (app == null || focus == null) return;
        try {
            AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) am.abandonAudioFocusRequest(focus);
        } catch (Exception ignored) { }
    }

    private static void holdAwake(boolean on) {
        try {
            if (on) {
                if (wake == null && app != null) {
                    PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "capgown:listen");
                        wake.setReferenceCounted(false);
                    }
                }
                if (wake != null) wake.acquire(4 * 60 * 60 * 1000L);
            } else if (wake != null && wake.isHeld()) {
                wake.release();
            }
        } catch (Exception ignored) { }
    }

    /* ---------- the place you got to, kept for each text ---------- */

    private static SharedPreferences prefs() {
        return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject places() {
        try {
            return new JSONObject(prefs().getString("places", "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static int savedPlace(String k) {
        if (app == null) return 0;
        return places().optInt(k, 0);
    }

    private static void savePlace() {
        if (app == null || key.isEmpty() || parts.isEmpty()) return;
        try {
            JSONObject o = places();
            o.remove(key);
            if (index > 0 && index < parts.size() - 1) o.put(key, index);
            Iterator<String> it = o.keys();
            int extra = o.length() - KEEP_PLACES;
            List<String> drop = new ArrayList<>();
            while (extra > 0 && it.hasNext()) {
                drop.add(it.next());
                extra--;
            }
            for (String d : drop) o.remove(d);
            prefs().edit().putString("places", o.toString()).apply();
        } catch (JSONException ignored) { }
    }

    private static void forgetPlace() {
        if (app == null || key.isEmpty()) return;
        JSONObject o = places();
        o.remove(key);
        prefs().edit().putString("places", o.toString()).apply();
    }

    /* ---------- telling the screens ---------- */

    static String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("state", state == PLAYING ? "playing" : state == PAUSED ? "paused" : "idle");
            o.put("title", title);
            o.put("i", parts.isEmpty() ? 0 : index + 1);
            o.put("n", parts.size());
            o.put("rate", rate < 0 ? 1.0 : Math.round(rate * 100) / 100.0);
            o.put("done", done);
            o.put("resumed", resumed);
            o.put("error", error);
        } catch (JSONException ignored) { }
        return o.toString();
    }

    private static void tell() {
        String json = status();
        for (Listener l : new ArrayList<>(listeners)) {
            try {
                l.onListenState(json);
            } catch (Exception ignored) { }
        }
    }
}
