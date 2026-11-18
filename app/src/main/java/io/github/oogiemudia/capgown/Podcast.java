package io.github.oogiemudia.capgown;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Plays podcast episodes inside the app. The episode streams from the show's own audio file; it carries on
 * with the screen off or another app open (PodcastService keeps it going and puts the controls on the lock
 * screen), and the place you got to is kept for each episode, so it starts there next time.
 *
 * Only one thing plays at a time: starting an episode stops Listen (ReadAloud), and Listen stops the episode.
 * Everything here runs on the main thread.
 */
final class Podcast {

    interface Listener {
        /** JSON: state (idle, loading, playing, paused), id, url, title, show, image, page, pos, dur (ms), rate, done, resumed, error, wait. */
        void onPodState(String json);
    }

    static final int IDLE = 0;
    static final int LOADING = 1;
    static final int PLAYING = 2;
    static final int PAUSED = 3;

    private static final String PREFS = "capgown-pod";
    private static final int KEEP_PLACES = 80;
    private static final long SAVE_EVERY = 15_000;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final List<Listener> listeners = new ArrayList<>();

    private static Context app;
    private static MediaPlayer player;
    private static boolean prepared;
    private static volatile int state = IDLE;
    private static int session;
    private static String id = "";
    private static String url = "";
    private static String title = "";
    private static String show = "";
    private static String image = "";
    private static String page = "";
    private static int startAt;     // where to start once the file is ready (ms)
    private static int lastPos;     // the last place known, kept for when the player is gone
    private static int duration;    // ms, 0 until known
    private static float rate = -1f;
    private static boolean done;
    private static boolean resumed;
    private static boolean waiting; // buffering: the phone is waiting for more of the file
    private static boolean pausedByFocus;
    private static String error = "";
    private static AudioFocusRequest focus;
    private static WifiManager.WifiLock wifi;

    private Podcast() { }

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

    static void init(Context c) {
        final Context appContext = c.getApplicationContext();
        onMain(() -> {
            if (app == null) app = appContext;
            if (rate < 0) rate = prefs().getFloat("rate", 1f);
        });
    }

    /**
     * Plays an episode. json: {id, url, title, show, image, page, at}. at is where to start in seconds;
     * leave it out to carry on from where you stopped last time. False if the address is not a web address.
     */
    static boolean play(Context c, String json) {
        final JSONObject o;
        try {
            o = new JSONObject(json);
        } catch (JSONException e) {
            return false;
        }
        String u = o.optString("url", "").trim();
        if (!u.matches("(?i)https?://[^\\s]+") || u.length() > 4000) return false;
        if (u.regionMatches(true, 0, "http://", 0, 7)) u = "https://" + u.substring(7); // Android plays https only
        final String audio = u;
        final Context appContext = c.getApplicationContext();
        final double at = o.optDouble("at", -1);
        onMain(() -> {
            app = appContext;
            if (rate < 0) rate = prefs().getFloat("rate", 1f);
            ReadAloud.stop();
            if (audio.equals(url) && state != IDLE) {
                // the same episode: carry on, or move to the place asked for
                if (at >= 0) seekNow((int) (at * 1000));
                if (state == PAUSED) resumeNow();
                tell();
                return;
            }
            if (state != IDLE) savePlace();
            release();
            id = clip(o.optString("id", ""), 200);
            url = audio;
            title = clip(o.optString("title", ""), 300);
            if (title.isEmpty()) title = "Podcast episode";
            show = clip(o.optString("show", ""), 200);
            image = clip(o.optString("image", ""), 2000);
            page = clip(o.optString("page", ""), 2000);
            error = "";
            done = false;
            waiting = false;
            duration = Math.max(0, (int) (o.optDouble("dur", 0) * 1000));
            int saved = savedPlace(url);
            resumed = at < 0 && saved > 0;
            startAt = at >= 0 ? (int) (at * 1000) : saved;
            lastPos = startAt;
            state = LOADING;
            pausedByFocus = false;
            PodcastService.start(appContext);
            takeFocus();
            open();
            tell();
        });
        return true;
    }

    private static void open() {
        final int s = ++session;
        prepared = false;
        MediaPlayer p = new MediaPlayer();
        player = p;
        try {
            p.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            p.setWakeMode(app, PowerManager.PARTIAL_WAKE_LOCK);
            Map<String, String> headers = new HashMap<>();
            headers.put("User-Agent", PodFeed.UA);
            p.setDataSource(app, Uri.parse(url), headers);
        } catch (Exception e) {
            finish("This episode could not be opened. Try again, or open the episode's page.");
            return;
        }
        p.setOnPreparedListener(mp -> {
            if (s != session) return;
            prepared = true;
            waiting = false;
            int d = 0;
            try {
                d = mp.getDuration();
            } catch (Exception ignored) { }
            if (d > 0) duration = d;
            // a saved place in the last half minute means it was finished: start again
            if (startAt > 0 && (duration <= 0 || startAt < duration - 30_000)) {
                try {
                    mp.seekTo(startAt);
                } catch (Exception ignored) { }
            } else {
                resumed = false;
            }
            if (state == LOADING) startNow();
            tell();
        });
        p.setOnCompletionListener(mp -> {
            if (s != session) return;
            forgetPlace();
            done = true;
            finish("");
        });
        p.setOnErrorListener((mp, what, extra) -> {
            if (s != session) return true;
            lastPos = position();
            savePlace();
            finish(prepared
                    ? "The episode stopped loading. Check your connection, then tap Play to carry on from the same place."
                    : "The episode could not be loaded. Check your connection and try again, or open the episode's page.");
            return true;
        });
        p.setOnInfoListener((mp, what, extra) -> {
            if (s != session) return false;
            if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) {
                waiting = true;
                tell();
            } else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) {
                waiting = false;
                tell();
            }
            return false;
        });
        p.setOnSeekCompleteListener(mp -> {
            if (s == session) tell();
        });
        try {
            p.prepareAsync();
        } catch (Exception e) {
            finish("This episode could not be opened. Try again, or open the episode's page.");
        }
    }

    private static void startNow() {
        if (player == null || !prepared) return;
        state = PLAYING;
        try {
            player.start();
            applyRate();
        } catch (Exception e) {
            finish("The phone could not play this episode.");
            return;
        }
        holdWifi(true);
        MAIN.removeCallbacks(SAVER);
        MAIN.postDelayed(SAVER, SAVE_EVERY);
    }

    private static final Runnable SAVER = new Runnable() {
        @Override
        public void run() {
            if (state != PLAYING) return;
            lastPos = position();
            savePlace();
            MAIN.postDelayed(this, SAVE_EVERY);
        }
    };

    static void pause() {
        onMain(() -> pauseNow(false));
    }

    private static void pauseNow(boolean byFocus) {
        if (state != PLAYING && state != LOADING) return;
        if (state == PLAYING && player != null && prepared) {
            try {
                player.pause();
            } catch (Exception ignored) { }
        }
        state = PAUSED;
        pausedByFocus = byFocus;
        lastPos = position();
        savePlace();
        holdWifi(false);
        if (!byFocus) dropFocus();
        tell();
    }

    static void resume() {
        onMain(Podcast::resumeNow);
    }

    private static void resumeNow() {
        if (app == null) return;
        if (state == IDLE) {
            // stopped by an error or a stop: start the same episode again from its place
            if (url.isEmpty() || done) return;
            error = "";
            startAt = lastPos;
            resumed = false;
            state = LOADING;
            PodcastService.start(app);
            takeFocus();
            open();
            tell();
            return;
        }
        if (state != PAUSED) return;
        ReadAloud.stop();
        pausedByFocus = false;
        resumed = false;
        PodcastService.start(app);
        takeFocus();
        if (player != null && prepared) startNow();
        else state = LOADING;
        tell();
    }

    static void toggle() {
        onMain(() -> {
            if (state == PLAYING || state == LOADING) pauseNow(false);
            else resumeNow();
        });
    }

    /** Back or forward by seconds: -15 is back a little, 30 forward. */
    static void skip(int seconds) {
        onMain(() -> {
            if (state == IDLE) return;
            seekNow(position() + seconds * 1000);
            tell();
        });
    }

    /** Goes to a place in the episode, in milliseconds from the start. */
    static void seek(long ms) {
        onMain(() -> {
            if (state == IDLE) return;
            seekNow((int) Math.max(0, Math.min(Integer.MAX_VALUE, ms)));
            tell();
        });
    }

    private static void seekNow(int ms) {
        int to = Math.max(0, ms);
        if (duration > 0) to = Math.min(to, Math.max(0, duration - 1000));
        resumed = false;
        lastPos = to;
        if (player != null && prepared) {
            try {
                player.seekTo(to);
            } catch (Exception ignored) { }
        } else {
            startAt = to;
        }
        savePlace();
    }

    static void restart() {
        seek(0);
    }

    static void setRate(double r) {
        final float v = (float) Math.max(0.5, Math.min(2.5, r));
        onMain(() -> {
            rate = v;
            if (app != null) prefs().edit().putFloat("rate", v).apply();
            if (state == PLAYING) applyRate();
            tell();
        });
    }

    /** Speed can only be set while playing: setting it on a paused player starts it again. */
    private static void applyRate() {
        if (player == null || !prepared || state != PLAYING) return;
        try {
            PlaybackParams pp = player.getPlaybackParams();
            player.setPlaybackParams(pp.setSpeed(rate < 0 ? 1f : rate));
        } catch (Exception ignored) { }
    }

    static void stop() {
        onMain(() -> {
            if (state == IDLE) return;
            lastPos = position();
            savePlace();
            finish("");
        });
    }

    private static void finish(String why) {
        state = IDLE;
        error = why == null ? "" : why;
        waiting = false;
        if (prepared && player != null) lastPos = position();
        release();
        dropFocus();
        tell();
    }

    private static void release() {
        session++;
        MAIN.removeCallbacks(SAVER);
        holdWifi(false);
        if (player != null) {
            MediaPlayer p = player;
            player = null;
            prepared = false;
            try {
                p.reset();
            } catch (Exception ignored) { }
            try {
                p.release();
            } catch (Exception ignored) { }
        }
    }

    private static int position() {
        if (player != null && prepared) {
            try {
                return Math.max(0, player.getCurrentPosition());
            } catch (Exception ignored) { }
        }
        return Math.max(0, lastPos);
    }

    /* ---------- sound, wifi ---------- */

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
                                if (state == PAUSED && pausedByFocus) resumeNow();
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

    /** Keeps the wifi awake while an episode streams with the screen off. */
    @SuppressWarnings("deprecation")
    private static void holdWifi(boolean on) {
        try {
            if (on) {
                if (wifi == null && app != null) {
                    WifiManager wm = (WifiManager) app.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "capgown:podcast");
                        wifi.setReferenceCounted(false);
                    }
                }
                if (wifi != null && !wifi.isHeld()) wifi.acquire();
            } else if (wifi != null && wifi.isHeld()) {
                wifi.release();
            }
        } catch (Exception ignored) { }
    }

    /* ---------- the place you got to in each episode ---------- */

    private static SharedPreferences prefs() {
        return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject placesObj() {
        if (app == null) return new JSONObject();
        try {
            return new JSONObject(prefs().getString("places", "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** Every episode you stopped part way through: {audio address: milliseconds}. */
    static String places() {
        return placesObj().toString();
    }

    private static int savedPlace(String k) {
        return placesObj().optInt(k, 0);
    }

    private static void savePlace() {
        if (app == null || url.isEmpty()) return;
        try {
            JSONObject o = placesObj();
            o.remove(url); // removed and put back, so the newest is last and the oldest go first
            int at = lastPos;
            if (at > 15_000 && (duration <= 0 || at < duration - 30_000)) o.put(url, at);
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
        if (app == null || url.isEmpty()) return;
        JSONObject o = placesObj();
        o.remove(url);
        prefs().edit().putString("places", o.toString()).apply();
    }

    /* ---------- telling the screens ---------- */

    static String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("state", state == PLAYING ? "playing" : state == PAUSED ? "paused" : state == LOADING ? "loading" : "idle");
            o.put("id", id);
            o.put("url", url);
            o.put("title", title);
            o.put("show", show);
            o.put("image", image);
            o.put("page", page);
            o.put("pos", position());
            o.put("dur", duration);
            o.put("rate", rate < 0 ? 1.0 : Math.round(rate * 100) / 100.0);
            o.put("done", done);
            o.put("resumed", resumed);
            o.put("wait", waiting || state == LOADING);
            o.put("error", error);
        } catch (JSONException ignored) { }
        return o.toString();
    }

    static String title() {
        return title;
    }

    static String show() {
        return show;
    }

    static String image() {
        return image;
    }

    static long positionMs() {
        return position();
    }

    static long durationMs() {
        return duration;
    }

    static float speed() {
        return rate < 0 ? 1f : rate;
    }

    private static void tell() {
        String json = status();
        for (Listener l : new ArrayList<>(listeners)) {
            try {
                l.onPodState(json);
            } catch (Exception ignored) { }
        }
    }

    private static String clip(String s, int max) {
        String t = s == null ? "" : s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
