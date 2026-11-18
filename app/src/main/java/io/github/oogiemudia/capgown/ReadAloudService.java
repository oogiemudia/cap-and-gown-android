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
import android.os.Build;
import android.os.IBinder;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps Listen (ReadAloud) going while the screen is off or another app is open, and shows a notification
 * with Back, Pause or Play, and Stop.
 */
public class ReadAloudService extends Service implements ReadAloud.Listener {

    static final String ACTION_SHOW = "io.github.oogiemudia.capgown.LISTEN_SHOW";
    static final String ACTION_TOGGLE = "io.github.oogiemudia.capgown.LISTEN_TOGGLE";
    static final String ACTION_BACK = "io.github.oogiemudia.capgown.LISTEN_BACK";
    static final String ACTION_STOP = "io.github.oogiemudia.capgown.LISTEN_STOP";

    static final String CHANNEL = "listen";
    static final int NOTIF_ID = 21;

    private boolean listening;

    /** Starts the service, which then follows what ReadAloud is doing. */
    static void start(Context c) {
        Intent i = new Intent(c, ReadAloudService.class).setAction(ACTION_SHOW);
        try {
            c.startForegroundService(i);
        } catch (Exception e) {
            // Android would not start it (the app is in the background). Reading still works while the app is open.
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Android expects the notification straight away, whatever the service was started for.
        ensureChannel(this);
        Notification n = build(ReadAloud.status());
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!listening) {
            listening = true;
            ReadAloud.addListener(this);
        }
        String action = intent == null ? ACTION_SHOW : intent.getAction();
        if (ACTION_TOGGLE.equals(action)) ReadAloud.toggle();
        else if (ACTION_BACK.equals(action)) ReadAloud.skip(-1);
        else if (ACTION_STOP.equals(action)) ReadAloud.stop();
        if (ReadAloud.state() == ReadAloud.IDLE) end();
        return START_NOT_STICKY;
    }

    @Override
    public void onListenState(String json) {
        if (ReadAloud.state() == ReadAloud.IDLE) {
            end();
            return;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        try {
            nm.notify(NOTIF_ID, build(json));
        } catch (Exception ignored) { }
    }

    private void end() {
        if (listening) {
            listening = false;
            ReadAloud.removeListener(this);
        }
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (listening) {
            listening = false;
            ReadAloud.removeListener(this);
        }
        super.onDestroy();
    }

    /** Swiping the app away stops the reading, the same as closing a music app. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        ReadAloud.stop();
        super.onTaskRemoved(rootIntent);
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Listen", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shown while the app reads to you, with Pause and Stop");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private Notification build(String json) {
        JSONObject o;
        try {
            o = new JSONObject(json);
        } catch (JSONException e) {
            o = new JSONObject();
        }
        boolean playing = "playing".equals(o.optString("state"));
        String title = o.optString("title", "");
        if (title.isEmpty()) title = "Reading aloud";
        int n = o.optInt("n", 0);
        String text = n > 0
                ? (playing ? "Reading" : "Paused") + ", part " + o.optInt("i", 1) + " of " + n
                : "Getting the voice ready";
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        // The same intent as the app's icon, so a tap brings the app back as it was (the reader stays open).
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent openPi = PendingIntent.getActivity(this, 320, open, flags);
        PendingIntent backPi = PendingIntent.getService(this, 321,
                new Intent(this, ReadAloudService.class).setAction(ACTION_BACK), flags);
        PendingIntent togglePi = PendingIntent.getService(this, 322,
                new Intent(this, ReadAloudService.class).setAction(ACTION_TOGGLE), flags);
        PendingIntent stopPi = PendingIntent.getService(this, 323,
                new Intent(this, ReadAloudService.class).setAction(ACTION_STOP), flags);

        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
                .setContentTitle(title)
                .setContentText(text)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(playing)
                .setContentIntent(openPi)
                .setDeleteIntent(stopPi)
                .addAction(new Notification.Action.Builder((Icon) null, "Back", backPi).build())
                .addAction(new Notification.Action.Builder((Icon) null, playing ? "Pause" : "Play", togglePi).build())
                .addAction(new Notification.Action.Builder((Icon) null, "Stop", stopPi).build());
        if (n > 0) b.setProgress(n, Math.max(0, o.optInt("i", 1)), false);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }
}
