package io.github.oogiemudia.capgown;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps the list of planned alarms (sent by the planner page) and sets the next one
 * with AlarmManager.setAlarmClock, so it rings on time even when the phone is asleep.
 */
final class Alarms {

    static final String PREFS = "capgown";
    static final String KEY_PLAN = "plan";
    static final String KEY_STATE = "state";
    static final String KEY_NEXT = "next";
    static final String KEY_NEXT_TITLE = "nextTitle";

    static final int RC_NEXT = 100;
    static final int RC_SNOOZE = 101;
    static final int RC_TEST = 102;
    static final int RC_SHOW = 200;

    private Alarms() { }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Called by the planner every time something changes. */
    static void savePlan(Context c, String json) {
        prefs(c).edit().putString(KEY_PLAN, json == null ? "{}" : json).apply();
        scheduleNext(c);
    }

    static boolean alarmsOn(Context c) {
        try {
            return new JSONObject(prefs(c).getString(KEY_PLAN, "{}")).optBoolean("on", true);
        } catch (JSONException e) {
            return true;
        }
    }

    /** The earliest planned alarm after the given time, or null. */
    static JSONObject nextFromPlan(Context c, long after) {
        try {
            JSONObject plan = new JSONObject(prefs(c).getString(KEY_PLAN, "{}"));
            if (!plan.optBoolean("on", true)) return null;
            JSONArray list = plan.optJSONArray("alarms");
            if (list == null) return null;
            JSONObject best = null;
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.optJSONObject(i);
                if (a == null) continue;
                long at = a.optLong("at", 0);
                if (at > after && (best == null || at < best.optLong("at", 0))) best = a;
            }
            return best;
        } catch (JSONException e) {
            return null;
        }
    }

    /** Sets (or clears) the next planned alarm. Safe to call as often as needed. */
    static void scheduleNext(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        JSONObject next = nextFromPlan(c, System.currentTimeMillis() + 30_000L);
        if (next == null) {
            am.cancel(firePending(c, RC_NEXT, null));
            prefs(c).edit().putLong(KEY_NEXT, 0).putString(KEY_NEXT_TITLE, "").apply();
            return;
        }
        long at = next.optLong("at", 0);
        setAlarm(c, am, at, firePending(c, RC_NEXT, next.toString()));
        prefs(c).edit().putLong(KEY_NEXT, at).putString(KEY_NEXT_TITLE, next.optString("title", "")).apply();
    }

    /** Rings again after the given number of minutes. */
    static void snooze(Context c, String payload, int minutes) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        long at = System.currentTimeMillis() + minutes * 60_000L;
        setAlarm(c, am, at, firePending(c, RC_SNOOZE, payload));
        prefs(c).edit().putLong("snoozeAt", at).apply();
    }

    static void cancelSnooze(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(firePending(c, RC_SNOOZE, null));
        prefs(c).edit().putLong("snoozeAt", 0).apply();
    }

    /** A test alarm a few seconds from now, so the sound and screen can be checked. */
    static void test(Context c, int seconds) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        JSONObject o = new JSONObject();
        try {
            o.put("title", "Test alarm");
            JSONArray lines = new JSONArray();
            lines.put("This is how your study alarm looks and sounds.");
            lines.put("Tap Open planner, Snooze or Stop.");
            o.put("lines", lines);
            o.put("test", true);
        } catch (JSONException ignored) { }
        long at = System.currentTimeMillis() + Math.max(5, seconds) * 1000L;
        setAlarm(c, am, at, firePending(c, RC_TEST, o.toString()));
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    private static void setAlarm(Context c, AlarmManager am, long at, PendingIntent fire) {
        if (!canExact(c)) {
            // Without exact alarm access Android may ring a little late, but it still rings.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            return;
        }
        Intent show = new Intent(c, MainActivity.class)
                .putExtra("view", "today")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent showPi = PendingIntent.getActivity(c, RC_SHOW, show,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPi), fire);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
        }
    }

    private static PendingIntent firePending(Context c, int requestCode, String payload) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction("io.github.oogiemudia.capgown.FIRE." + requestCode);
        if (payload != null) i.putExtra("alarm", payload);
        return PendingIntent.getBroadcast(c, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
