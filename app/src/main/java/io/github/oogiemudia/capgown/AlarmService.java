package io.github.oogiemudia.capgown;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Plays the alarm sound on the alarm volume, vibrates and shows the alarm screen.
 * If nobody answers within five minutes it snoozes itself, up to three times.
 */
public class AlarmService extends Service {

    static final String ACTION_RING = "io.github.oogiemudia.capgown.RING";
    static final String ACTION_SNOOZE = "io.github.oogiemudia.capgown.SNOOZE";
    static final String ACTION_STOP = "io.github.oogiemudia.capgown.STOP";

    static final String CHANNEL = "study_alarms";
    static final String CHANNEL_FALLBACK = "study_alarm_fallback";
    static final int NOTIF_ID = 7;
    static final int SNOOZE_MINUTES = 10;
    static final long RING_MS = 5 * 60 * 1000L;
    static final int MAX_AUTO_SNOOZES = 3;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private Ringtone ringtone;
    private Vibrator vibrator;
    private PowerManager.WakeLock wake;
    private String payload;

    private final Runnable timeout = this::autoSnooze;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_RING : intent.getAction();
        String p = intent == null ? null : intent.getStringExtra("alarm");

        if (ACTION_SNOOZE.equals(action)) {
            Alarms.snooze(this, p != null ? p : (payload != null ? payload : "{}"), SNOOZE_MINUTES);
            finishRinging();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            Alarms.cancelSnooze(this);
            finishRinging();
            return START_NOT_STICKY;
        }

        payload = p != null ? p : (payload != null ? payload : "{}");
        ensureChannels(this);
        Notification n = buildNotification(this, payload);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, n);
        }
        startRinging();
        handler.removeCallbacks(timeout);
        handler.postDelayed(timeout, RING_MS);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(timeout);
        stopRinging();
        super.onDestroy();
    }

    private void autoSnooze() {
        try {
            JSONObject o = new JSONObject(payload == null ? "{}" : payload);
            int done = o.optInt("auto", 0);
            if (done < MAX_AUTO_SNOOZES && !o.optBoolean("test", false)) {
                o.put("auto", done + 1);
                Alarms.snooze(this, o.toString(), SNOOZE_MINUTES);
            }
        } catch (JSONException ignored) { }
        finishRinging();
    }

    private void finishRinging() {
        handler.removeCallbacks(timeout);
        stopRinging();
        AlarmActivity.closeIfOpen();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIF_ID);
        stopSelf();
    }

    private void startRinging() {
        stopRinging();
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        Uri uri = alarmSound();
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(attrs);
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            if (player != null) {
                try { player.release(); } catch (Exception ignored) { }
                player = null;
            }
            try {
                ringtone = RingtoneManager.getRingtone(this, uri);
                if (ringtone != null) {
                    ringtone.setAudioAttributes(attrs);
                    if (Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
                    ringtone.play();
                }
            } catch (Exception ignored) { }
        }
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 900, 700};
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs);
            }
        } catch (Exception ignored) { }
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "capgown:ring");
                wake.acquire(RING_MS + 15_000L);
            }
        } catch (Exception ignored) { }
    }

    private void stopRinging() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            try { player.release(); } catch (Exception ignored) { }
            player = null;
        }
        if (ringtone != null) {
            try { ringtone.stop(); } catch (Exception ignored) { }
            ringtone = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception ignored) { }
            vibrator = null;
        }
        if (wake != null) {
            try { if (wake.isHeld()) wake.release(); } catch (Exception ignored) { }
            wake = null;
        }
    }

    static Uri alarmSound() {
        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return uri;
    }

    static void ensureChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Study alarms", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("The alarm screen for study evenings and the weekly PebblePad review");
            ch.setSound(null, null); // the service plays the sound itself, on the alarm volume
            ch.enableVibration(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_FALLBACK) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_FALLBACK, "Study alarms (backup)", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Used only if Android stops the alarm sound from starting");
            ch.setSound(alarmSound(), new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 900, 700, 900, 700, 900});
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
    }

    static String title(JSONObject o) {
        String t = o.optString("title", "");
        return t.isEmpty() ? "Study time" : t;
    }

    static String body(JSONObject o) {
        JSONArray lines = o.optJSONArray("lines");
        if (lines == null || lines.length() == 0) return "Open the planner to see tonight's steps.";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.length(); i++) {
            if (i > 0) sb.append('\n');
            sb.append(lines.optString(i));
        }
        return sb.toString();
    }

    static JSONObject parse(String payload) {
        try {
            return new JSONObject(payload == null ? "{}" : payload);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static Notification.Builder baseBuilder(Context c, String channel, String payload) {
        JSONObject o = parse(payload);
        String text = body(o);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        Intent full = new Intent(c, AlarmActivity.class)
                .putExtra("alarm", payload)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fullPi = PendingIntent.getActivity(c, 300, full, flags);

        Intent open = new Intent(c, MainActivity.class)
                .putExtra("stopAlarm", true)
                .putExtra("view", "today")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, 301, open, flags);

        Intent snooze = new Intent(c, AlarmService.class).setAction(ACTION_SNOOZE).putExtra("alarm", payload);
        PendingIntent snoozePi = PendingIntent.getService(c, 302, snooze, flags);

        Intent stop = new Intent(c, AlarmService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(c, 303, stop, flags);

        Notification.Builder b = new Notification.Builder(c, channel)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title(o))
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fullPi, true)
                .setContentIntent(fullPi)
                .addAction(new Notification.Action.Builder((Icon) null, "Open planner", openPi).build())
                .addAction(new Notification.Action.Builder((Icon) null, "Snooze " + SNOOZE_MINUTES + " min", snoozePi).build())
                .addAction(new Notification.Action.Builder((Icon) null, "Stop", stopPi).build());
        return b;
    }

    static Notification buildNotification(Context c, String payload) {
        Notification.Builder b = baseBuilder(c, CHANNEL, payload).setOngoing(true).setAutoCancel(false);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    /** Used only when Android will not let the ringing service start. */
    static void fallbackNotify(Context c, String payload) {
        ensureChannels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification n = baseBuilder(c, CHANNEL_FALLBACK, payload).setAutoCancel(true).build();
        n.flags |= Notification.FLAG_INSISTENT; // repeats the sound until the notification is opened
        try {
            nm.notify(NOTIF_ID + 1, n);
        } catch (SecurityException ignored) { }
    }
}
