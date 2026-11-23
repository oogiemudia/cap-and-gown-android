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
import android.os.PowerManager;

/**
 * Keeps the mentor meeting listener going while the phone is locked or another app is open.
 *
 * Android only lets an app use the microphone off the screen while it shows a notice that it is doing so,
 * and only if that notice was put up while the app was on the screen. So MainActivity starts this service
 * as the listening starts, and stops it as the listening ends. The service itself hears nothing: the
 * listening is still done by Dictation in MainActivity. It shows the notice, with a Pause button, and
 * keeps the phone's processor awake. Only words are kept. No sound is saved.
 */
public class MeetingService extends Service {

    static final String ACTION_SHOW = "io.github.oogiemudia.capgown.MEETING_SHOW";
    static final String ACTION_PAUSE = "io.github.oogiemudia.capgown.MEETING_PAUSE";

    static final String CHANNEL = "meeting";
    static final int NOTIF_ID = 31;
    private static final long LOCK_MS = 95 * 60 * 1000L; // a little over the longest meeting, in case it is never released

    private static boolean wanted;        // a meeting is being listened to
    private static boolean running;       // the notice is up, so the microphone may be used off the screen
    private static Runnable onPause;      // what the notice's Pause button does
    private static MeetingService instance;

    private PowerManager.WakeLock lock;

    /** True once the notice is up: from then on the listening may carry on off the screen. */
    static boolean running() {
        return running;
    }

    /**
     * Call while the app is on the screen and the microphone is allowed. It is started as an ordinary
     * service on purpose: if Android then refuses to put the notice up, the listening simply stays as it
     * was (on the screen only) and nothing crashes.
     */
    static void start(Context c, Runnable pause) {
        wanted = true;
        onPause = pause;
        try {
            c.startService(new Intent(c, MeetingService.class).setAction(ACTION_SHOW));
        } catch (Exception e) {
            wanted = false;
        }
    }

    static void stop() {
        wanted = false;
        onPause = null;
        if (instance != null) instance.end();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_SHOW : intent.getAction();
        if (ACTION_PAUSE.equals(action)) {
            Runnable r = onPause;
            if (r != null) r.run(); // MainActivity stops the listening, which then stops this service
            else end();
            return START_NOT_STICKY;
        }
        if (!wanted) {
            end();
            return START_NOT_STICKY;
        }
        if (!running) {
            ensureChannel(this);
            try {
                if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIF_ID, build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
                else startForeground(NOTIF_ID, build());
                running = true;
            } catch (Exception e) {
                // Android would not allow it. The listening carries on while the app is on the screen.
                end();
                return START_NOT_STICKY;
            }
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "capgown:meeting");
                    lock.setReferenceCounted(false);
                    lock.acquire(LOCK_MS);
                }
            } catch (Exception ignored) { }
        }
        return START_NOT_STICKY;
    }

    private void end() {
        boolean was = running;
        running = false;
        try {
            if (lock != null && lock.isHeld()) lock.release();
        } catch (Exception ignored) { }
        lock = null;
        if (was) stopForeground(Service.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        try {
            if (lock != null && lock.isHeld()) lock.release();
        } catch (Exception ignored) { }
        lock = null;
        if (instance == this) instance = null;
        super.onDestroy();
    }

    /** Swiping the app away stops the listening, the same as closing it. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Runnable r = onPause;
        if (r != null) r.run();
        end();
        super.onTaskRemoved(rootIntent);
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Mentor meeting", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shown while the app listens to a mentor meeting, with Pause");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private Notification build() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        // The same intent as the app's icon, so a tap brings the app back as it was.
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent openPi = PendingIntent.getActivity(this, 330, open, flags);
        PendingIntent pausePi = PendingIntent.getService(this, 331,
                new Intent(this, MeetingService.class).setAction(ACTION_PAUSE), flags);

        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Listening to your mentor meeting")
                .setContentText("Only the words are kept. Tap to open Cap and Gown.")
                .setCategory(Notification.CATEGORY_SERVICE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setUsesChronometer(true)
                .setOngoing(true)
                .setContentIntent(openPi)
                .addAction(new Notification.Action.Builder((Icon) null, "Pause", pausePi).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }
}
