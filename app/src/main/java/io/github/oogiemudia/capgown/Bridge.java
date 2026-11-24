package io.github.oogiemudia.capgown;

import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/** What the planner page can ask the phone to do. Exposed to the page as window.AndroidApp. */
public class Bridge {

    private final MainActivity activity;

    public Bridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String version() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    /** A copy of the planner's ticks, kept by the app in case the page storage is ever cleared. */
    @JavascriptInterface
    public void saveState(String json) {
        if (json == null || json.length() > 2_000_000) return;
        Alarms.prefs(activity).edit().putString(Alarms.KEY_STATE, json).apply();
    }

    @JavascriptInterface
    public String loadState() {
        return Alarms.prefs(activity).getString(Alarms.KEY_STATE, "");
    }

    /** The planner sends the coming alarms; the app sets the next one. */
    @JavascriptInterface
    public void setAlarms(String json) {
        Alarms.savePlan(activity, json);
    }

    @JavascriptInterface
    public void testAlarm(int seconds) {
        Alarms.test(activity, seconds);
    }

    @JavascriptInterface
    public String status() {
        JSONObject o = new JSONObject();
        try {
            NotificationManager nm = activity.getSystemService(NotificationManager.class);
            PowerManager pm = activity.getSystemService(PowerManager.class);
            AudioManager audio = activity.getSystemService(AudioManager.class);
            o.put("version", version());
            o.put("notifications", nm != null && nm.areNotificationsEnabled());
            o.put("fullScreen", Build.VERSION.SDK_INT < 34 || (nm != null && nm.canUseFullScreenIntent()));
            o.put("exact", Alarms.canExact(activity));
            o.put("battery", pm != null && pm.isIgnoringBatteryOptimizations(activity.getPackageName()));
            if (audio != null) {
                o.put("alarmVolume", audio.getStreamVolume(AudioManager.STREAM_ALARM));
                o.put("alarmVolumeMax", audio.getStreamMaxVolume(AudioManager.STREAM_ALARM));
            }
            o.put("next", Alarms.prefs(activity).getLong(Alarms.KEY_NEXT, 0));
            o.put("nextTitle", Alarms.prefs(activity).getString(Alarms.KEY_NEXT_TITLE, ""));
            o.put("snoozeAt", Alarms.prefs(activity).getLong("snoozeAt", 0));
            o.put("on", Alarms.alarmsOn(activity));
        } catch (JSONException ignored) { }
        return o.toString();
    }

    /** Opens the right Android settings screen for something the alarm needs. */
    @JavascriptInterface
    public void fix(String what) {
        activity.runOnUiThread(() -> {
            String pkg = activity.getPackageName();
            Intent i = null;
            if ("notifications".equals(what)) {
                if (activity.requestNotifications()) return;
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
            } else if ("fullscreen".equals(what) && Build.VERSION.SDK_INT >= 34) {
                i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg));
            } else if ("exact".equals(what) && Build.VERSION.SDK_INT >= 31) {
                i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
            } else if ("battery".equals(what)) {
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
            } else if ("sound".equals(what)) {
                i = new Intent(Settings.ACTION_SOUND_SETTINGS);
            }
            if (i == null) i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            try {
                activity.startActivity(i);
            } catch (Exception e) {
                try {
                    activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
                } catch (Exception ignored) { }
            }
        });
    }

    /** Saves a file (backup or calendar file) to the phone's Downloads folder. */
    @JavascriptInterface
    public boolean saveFile(String name, String text, String mime) {
        if (name == null || text == null) return false;
        String safe = Files.safeName(name);
        String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        if (Build.VERSION.SDK_INT >= 29) return Files.saveToDownloads(activity, safe, text.getBytes(StandardCharsets.UTF_8), type);
        // Older Android: hand the text to another app (email, Drive, notes).
        activity.runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, safe)
                    .putExtra(Intent.EXTRA_TEXT, text);
            try {
                activity.startActivity(Intent.createChooser(send, "Save " + safe));
            } catch (Exception ignored) { }
        });
        return true;
    }

    /* ---------- PebblePad's own phone app (PebblePocket) ---------- */

    /** The PebblePad app's name on Google Play. The manifest lists it too, so that Android lets this app see it. */
    static final String PEBBLEPAD_APP = "pebblepad.PebblePocket.android";

    /** True when the PebblePad app is on this phone. */
    @JavascriptInterface
    public boolean hasPebblePad() {
        try {
            return activity.getPackageManager().getLaunchIntentForPackage(PEBBLEPAD_APP) != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** Opens the PebblePad app. False when it is not on this phone: the page then shows it in the Play Store. */
    @JavascriptInterface
    public boolean openPebblePad() {
        final Intent open;
        try {
            open = activity.getPackageManager().getLaunchIntentForPackage(PEBBLEPAD_APP);
        } catch (Exception e) {
            return false;
        }
        if (open == null) return false;
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(open);
            } catch (Exception e) {
                activity.toastNative("The PebblePad app could not be opened.");
            }
        });
        return true;
    }

    /* ---------- the Chat tab (claude.ai inside the app) ---------- */

    /** Shows the chat between the planner's top bar and tab bar. Sizes are in the page's CSS pixels. */
    @JavascriptInterface
    public void chatShow(int top, int bottom, int cssWidth, String startUrl) {
        activity.runOnUiThread(() -> activity.chat.show(top, bottom, cssWidth, startUrl));
    }

    @JavascriptInterface
    public void chatHide() {
        activity.runOnUiThread(() -> activity.chat.hide());
    }

    @JavascriptInterface
    public void chatGo(String url) {
        if (url == null) return;
        activity.runOnUiThread(() -> activity.chat.go(url));
    }

    @JavascriptInterface
    public void chatReload() {
        activity.runOnUiThread(() -> activity.chat.reload());
    }

    /** Opens a sign-in link copied from the Claude email. Returns ok, empty or nolink. */
    @JavascriptInterface
    public String chatPasteLink() {
        String link = activity.chat.readCopiedLink();
        if (!link.startsWith("https://")) return link;
        activity.runOnUiThread(() -> activity.chat.load(link));
        return "ok";
    }

    /** Puts text (the week's plan, or the notes of a mentor meeting with their brief) into the chat's message box. */
    @JavascriptInterface
    public void chatInsert(String text) {
        if (text == null || text.length() > 200_000) return;
        activity.runOnUiThread(() -> activity.chat.insert(text));
    }

    @JavascriptInterface
    public void chatOpenBrowser() {
        activity.runOnUiThread(() -> {
            String u = activity.chat.currentUrl();
            activity.openOutside(Uri.parse(u != null && u.startsWith("https://") ? u : ChatPane.NEW_CHAT));
        });
    }

    @JavascriptInterface
    public void chatSignOut() {
        activity.runOnUiThread(() -> activity.chat.signOut());
    }

    @JavascriptInterface
    public boolean copyText(String text) {
        return text != null && text.length() <= 200_000 && ChatPane.copy(activity, text);
    }

    /* ---------- Listen: the phone reads to you (see ReadAloud) ---------- */

    /** Reads text of any length aloud, and carries on with the screen off. False if there is nothing to read. */
    @JavascriptInterface
    public boolean listenStart(String title, String text) {
        if (text == null || text.length() > 600_000) return false;
        return ReadAloud.play(activity, title, text);
    }

    @JavascriptInterface
    public void listenPause() {
        ReadAloud.pause();
    }

    @JavascriptInterface
    public void listenResume() {
        ReadAloud.resume();
    }

    @JavascriptInterface
    public void listenStop() {
        ReadAloud.stop();
    }

    /** Back or forward by whole parts (a sentence or two each). */
    @JavascriptInterface
    public void listenSkip(int by) {
        ReadAloud.skip(by);
    }

    /** How fast the voice reads: 1 is normal. */
    @JavascriptInterface
    public void listenRate(double rate) {
        ReadAloud.setRate(rate);
    }

    @JavascriptInterface
    public void listenRestart() {
        ReadAloud.restart();
    }

    /** JSON: state (idle, playing, paused), title, i, n, rate, done, resumed, error. Changes arrive as window.__capgownListen(status). */
    @JavascriptInterface
    public String listenStatus() {
        return ReadAloud.status();
    }

    /** Opens a web page in the reader and reads it aloud once it has loaded. False if it cannot be opened. */
    @JavascriptInterface
    public boolean listenTo(String url, String title) {
        if (!ReaderActivity.canOpen(url)) return false;
        activity.runOnUiThread(() -> activity.openReader(url, title, true));
        return true;
    }

    /** The older read aloud, kept so an older page still works. */
    @JavascriptInterface
    public void speak(String text) {
        if (text != null && !text.isEmpty()) listenStart("Audio summary", text);
    }

    @JavascriptInterface
    public void stopSpeaking() {
        ReadAloud.stop();
    }

    /* ---------- Podcasts: episodes play inside the app (see Podcast, PodcastService and PodFeed) ---------- */

    /**
     * Finds a show's episodes. req names the answer; json is {feeds: [feed addresses], apple: Apple Podcasts id,
     * term: the show's name}. The answer arrives as window.__capgownPodFeed(req, {ok, title, image, feed, at, stale, error, eps}).
     */
    @JavascriptInterface
    public void podFeed(String req, String json) {
        final String name = req == null ? "" : req;
        final java.util.List<String> feeds = new java.util.ArrayList<>();
        String apple = "";
        String term = "";
        try {
            JSONObject o = new JSONObject(json == null ? "{}" : json);
            org.json.JSONArray a = o.optJSONArray("feeds");
            if (a != null) for (int i = 0; i < a.length() && i < 6; i++) {
                String f = a.optString(i, "").trim();
                if (f.matches("(?i)https?://[^\\s]+")) feeds.add(f);
            }
            apple = o.optString("apple", "").replaceAll("[^0-9]", "");
            term = o.optString("term", "").trim();
        } catch (JSONException e) {
            activity.podFeedResult(name, "{\"ok\":false,\"error\":\"bad request\"}");
            return;
        }
        final String ap = apple;
        final String tm = term.length() > 120 ? term.substring(0, 120) : term;
        final java.io.File cache = activity.getCacheDir();
        new Thread(() -> activity.podFeedResult(name, PodFeed.load(cache, feeds, ap, tm)), "podcast-feed").start();
    }

    /** Plays an episode: {id, url, title, show, image, page, at, dur}. at (seconds) is where to start; left out, it carries on from last time. */
    @JavascriptInterface
    public boolean podPlay(String json) {
        return json != null && json.length() < 20_000 && Podcast.play(activity, json);
    }

    @JavascriptInterface
    public void podPause() {
        Podcast.pause();
    }

    @JavascriptInterface
    public void podResume() {
        Podcast.resume();
    }

    @JavascriptInterface
    public void podStop() {
        Podcast.stop();
    }

    /** Back or forward by seconds. */
    @JavascriptInterface
    public void podSkip(int seconds) {
        Podcast.skip(seconds);
    }

    /** Goes to a place, in milliseconds from the start. */
    @JavascriptInterface
    public void podSeek(double ms) {
        Podcast.seek((long) ms);
    }

    /** How fast the episode plays: 1 is normal. */
    @JavascriptInterface
    public void podRate(double rate) {
        Podcast.setRate(rate);
    }

    /** JSON, as sent to window.__capgownPod: state (idle, loading, playing, paused), id, url, title, show, pos, dur, rate, done, resumed, wait, error. */
    @JavascriptInterface
    public String podStatus() {
        return Podcast.status();
    }

    /** Episodes stopped part way through: {audio address: milliseconds}. */
    @JavascriptInterface
    public String podPlaces() {
        return Podcast.places();
    }

    /* ---------- Speak: speech to text (see Dictation) ---------- */

    /** Whether this phone has a speech recogniser. */
    @JavascriptInterface
    public boolean dictateAvailable() {
        return Dictation.available(activity);
    }

    /**
     * Starts listening, asking for the microphone the first time. What it hears arrives as
     * window.__capgownDictate(kind, text): ready, partial, final, then end with the reason.
     */
    @JavascriptInterface
    public void dictateStart() {
        activity.startDictation();
    }

    @JavascriptInterface
    public void dictateStop() {
        activity.stopDictation();
    }

    /**
     * Listens to a whole meeting: the same as dictateStart, but it carries on through pauses (until nobody
     * has been heard for ten minutes, or ninety minutes have passed) and says "wait" with the reason while
     * it tries again after the signal or the recogniser drops out. dictateStop ends it. Only words reach
     * the page. No sound is kept. It carries on with the phone locked or another app open, under a notice
     * with a Pause button (MeetingService); Pause there ends it with the reason "paused", and a phone that
     * takes the microphone away off the screen ends it with "locked".
     */
    @JavascriptInterface
    public void meetingStart() {
        activity.startDictation(true);
    }

    /**
     * True while a meeting is being listened to under its own notice, which lets it carry on with the phone
     * locked or another app open. That the method exists tells the page this app can do it.
     */
    @JavascriptInterface
    public boolean meetingInBackground() {
        return activity.meetingInBackground();
    }

    /**
     * The app's own listening, which turns a meeting's sound into words on the phone itself, so that it
     * carries on with the phone locked and nothing leaves the phone. It needs a speech model, downloaded
     * once, in one of three sizes: small, medium or tiny. ownListen says, as JSON: supported (this phone
     * can run it), sizes { size: { bytes, ready } }, use (the size meetingStart will listen with, or "" for
     * the phone's speech service), busy (the size being downloaded), done and total (bytes), error
     * (offline, space or failed), metered (on mobile data) and broken (it would not start last time).
     * The page hears of changes through window.__capgownOwn(). That the method exists tells the page
     * this app can do it.
     */
    @JavascriptInterface
    public String ownListen() {
        return activity.ownStatus();
    }

    @JavascriptInterface
    public void ownDownload(String size) {
        if (SpeechModel.known(size)) activity.ownDownload(size);
    }

    @JavascriptInterface
    public void ownCancel() {
        SpeechModel.cancel();
    }

    /** Chooses the size to listen with, or "" for the phone's speech service. */
    @JavascriptInterface
    public void ownUse(String size) {
        if (size == null || size.isEmpty() || SpeechModel.known(size)) activity.ownUse(size == null ? "" : size);
    }

    @JavascriptInterface
    public void ownDelete(String size) {
        if (SpeechModel.known(size)) activity.ownDelete(size);
    }

    /**
     * A meeting's finished sentences reach the page as window.__capgownDictate("final", words, number, id).
     * If the page was held up while the phone was locked, it asks here for the ones after the last number
     * it had: { id, lines: [[number, words, time]], live }.
     */
    @JavascriptInterface
    public String meetingSince(String id, int seq) {
        return activity.meetingSince(id == null ? "" : id, seq);
    }

    /** The page has deleted the meeting's notes. */
    @JavascriptInterface
    public void meetingForget() {
        activity.meetingForget();
    }

    /** A phone toast, used while the chat covers the page. */
    @JavascriptInterface
    public void toast(String message) {
        if (message != null && !message.isEmpty()) activity.toastNative(message);
    }

    /** Opens a web page inside the app (the online library, a reading, a video or a podcast). False if it cannot. */
    @JavascriptInterface
    public boolean openReader(String url, String title) {
        if (!ReaderActivity.canOpen(url)) return false;
        activity.runOnUiThread(() -> activity.openReader(url, title, false));
        return true;
    }

    /**
     * Plays a YouTube lesson inside the app, on a screen of its own (VideoActivity). The request is JSON:
     * {id (the library item), v (YouTube's id for the video), title, start (seconds in)}. False if it cannot.
     */
    @JavascriptInterface
    public boolean videoPlay(String json) {
        try {
            JSONObject o = new JSONObject(json == null ? "" : json);
            String id = o.optString("id", "");
            String v = o.optString("v", "");
            if (id.isEmpty() || id.length() > 80 || !VideoActivity.isVideoId(v)) return false;
            String title = o.optString("title", "");
            int start = Math.max(0, Math.min(o.optInt("start", 0), 86400));
            activity.runOnUiThread(() -> activity.openVideo(id, v, title.length() > 200 ? title.substring(0, 200) : title, start));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** What the last video did, as JSON ({id, v, t, d, ended, page}), or "" when there is nothing new. Asking empties it. */
    @JavascriptInterface
    public String videoTake() {
        return VideoActivity.take(activity);
    }

    /** The pages saved with the reader's Save button since the last call, as a JSON list of {url, title}. */
    @JavascriptInterface
    public String takeSavedLinks() {
        return ReaderActivity.takeSaved(activity);
    }

    /** Live updates: which page is showing, whether a newer one is waiting, and when the app last looked. */
    @JavascriptInterface
    public String liveStatus() {
        return LiveUpdate.status(activity);
    }

    /** Looks for a newer page now. The answer arrives as window.__capgownUpdateResult(state, page). */
    @JavascriptInterface
    public void checkUpdate() {
        activity.checkForUpdate(true);
    }

    /** Shows the newer page that is waiting. */
    @JavascriptInterface
    public void applyUpdate() {
        activity.reloadPage();
    }

    /** The page says it has drawn, so the app knows this page works. */
    @JavascriptInterface
    public void pageReady(int page) {
        LiveUpdate.confirm(activity, page);
    }

    @JavascriptInterface
    public void setAutoUpdate(boolean on) {
        LiveUpdate.setAuto(activity, on);
    }

    /** Drops the downloaded page and shows the one built into the app again. */
    @JavascriptInterface
    public void revertUpdate() {
        LiveUpdate.revert(activity);
        activity.reloadPage();
    }
}
