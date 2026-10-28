package io.github.oogiemudia.capgown;

import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.OutputStream;
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
        String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
        String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = activity.getContentResolver();
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, safe);
            cv.put(MediaStore.Downloads.MIME_TYPE, type);
            cv.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = null;
            try {
                uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return false;
                try (OutputStream os = cr.openOutputStream(uri)) {
                    if (os == null) return false;
                    os.write(text.getBytes(StandardCharsets.UTF_8));
                }
                cv.clear();
                cv.put(MediaStore.Downloads.IS_PENDING, 0);
                cr.update(uri, cv, null, null);
                return true;
            } catch (Exception e) {
                if (uri != null) {
                    try { cr.delete(uri, null, null); } catch (Exception ignored) { }
                }
                return false;
            }
        }
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
}
