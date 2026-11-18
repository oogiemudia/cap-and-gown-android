package io.github.oogiemudia.capgown;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps a podcast playing while the screen is off or another app is open. Shows a media notification with
 * Back 15 seconds, Pause or Play, Forward 30 seconds and Stop, and gives the lock screen, headphones and
 * a car the same controls (a MediaSession). Unplugging headphones pauses the episode.
 */
public class PodcastService extends Service implements Podcast.Listener {

    static final String ACTION_SHOW = "io.github.oogiemudia.capgown.POD_SHOW";
    static final String ACTION_TOGGLE = "io.github.oogiemudia.capgown.POD_TOGGLE";
    static final String ACTION_BACK = "io.github.oogiemudia.capgown.POD_BACK";
    static final String ACTION_FORWARD = "io.github.oogiemudia.capgown.POD_FORWARD";
    static final String ACTION_STOP = "io.github.oogiemudia.capgown.POD_STOP";

    static final String CHANNEL = "podcast";
    static final int NOTIF_ID = 22;
    private static final String BACK15 = "back15";
    private static final String FWD30 = "fwd30";

    private boolean following;
    private MediaSession session;
    private boolean noisyOn;
    private String artFor = "";
    private Bitmap art;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) Podcast.pause();
        }
    };

    static void start(Context c) {
        Intent i = new Intent(c, PodcastService.class).setAction(ACTION_SHOW);
        try {
            c.startForegroundService(i);
        } catch (Exception e) {
            // Android would not start it (the app is in the background). The episode still plays while the app is open.
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannel(this);
        ensureSession();
        Notification n = build(Podcast.status());
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!following) {
            following = true;
            Podcast.addListener(this);
        }
        if (!noisyOn) {
            try {
                IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
                if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, f, Context.RECEIVER_NOT_EXPORTED);
                else registerReceiver(noisy, f);
                noisyOn = true;
            } catch (Exception ignored) { }
        }
        String action = intent == null ? ACTION_SHOW : intent.getAction();
        if (ACTION_TOGGLE.equals(action)) Podcast.toggle();
        else if (ACTION_BACK.equals(action)) Podcast.skip(-15);
        else if (ACTION_FORWARD.equals(action)) Podcast.skip(30);
        else if (ACTION_STOP.equals(action)) Podcast.stop();
        // (these all run straight away on this thread, so the state is already the new one)
        if (Podcast.state() == Podcast.IDLE) end();
        else onPodState(Podcast.status());
        return START_NOT_STICKY;
    }

    @Override
    public void onPodState(String json) {
        if (Podcast.state() == Podcast.IDLE) {
            end();
            return;
        }
        JSONObject o = parse(json);
        updateSession(o);
        loadArt(o.optString("image", ""));
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        try {
            nm.notify(NOTIF_ID, build(json));
        } catch (Exception ignored) { }
    }

    private void end() {
        if (following) {
            following = false;
            Podcast.removeListener(this);
        }
        if (noisyOn) {
            noisyOn = false;
            try {
                unregisterReceiver(noisy);
            } catch (Exception ignored) { }
        }
        if (session != null) {
            try {
                session.setActive(false);
                session.release();
            } catch (Exception ignored) { }
            session = null;
        }
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (following) {
            following = false;
            Podcast.removeListener(this);
        }
        if (noisyOn) {
            noisyOn = false;
            try {
                unregisterReceiver(noisy);
            } catch (Exception ignored) { }
        }
        if (session != null) {
            try {
                session.release();
            } catch (Exception ignored) { }
            session = null;
        }
        super.onDestroy();
    }

    /** Swiping the app away stops the episode, the same as Listen. The place is kept. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Podcast.stop();
        super.onTaskRemoved(rootIntent);
    }

    /* ---------- the lock screen, headphones and the car ---------- */

    private void ensureSession() {
        if (session != null) return;
        try {
            session = new MediaSession(this, "CapAndGownPodcast");
            session.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    Podcast.resume();
                }

                @Override
                public void onPause() {
                    Podcast.pause();
                }

                @Override
                public void onStop() {
                    Podcast.stop();
                }

                @Override
                public void onFastForward() {
                    Podcast.skip(30);
                }

                @Override
                public void onRewind() {
                    Podcast.skip(-15);
                }

                @Override
                public void onSkipToNext() {
                    Podcast.skip(30);
                }

                @Override
                public void onSkipToPrevious() {
                    Podcast.skip(-15);
                }

                @Override
                public void onSeekTo(long pos) {
                    Podcast.seek(pos);
                }

                @Override
                public void onCustomAction(String action, android.os.Bundle extras) {
                    if (BACK15.equals(action)) Podcast.skip(-15);
                    else if (FWD30.equals(action)) Podcast.skip(30);
                }
            }, main);
            Intent open = openIntent();
            session.setSessionActivity(PendingIntent.getActivity(this, 330, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            session.setActive(true);
        } catch (Exception e) {
            session = null;
        }
    }

    private void updateSession(JSONObject o) {
        if (session == null) return;
        try {
            String st = o.optString("state");
            int ps = "playing".equals(st) ? (o.optBoolean("wait") ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PLAYING)
                    : "loading".equals(st) ? PlaybackState.STATE_BUFFERING
                    : "paused".equals(st) ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_STOPPED;
            float speed = "playing".equals(st) ? (float) o.optDouble("rate", 1) : 0f;
            session.setPlaybackState(new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                            | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_FAST_FORWARD
                            | PlaybackState.ACTION_REWIND)
                    .setState(ps, o.optLong("pos", 0), speed)
                    .addCustomAction(new PlaybackState.CustomAction.Builder(BACK15, "Back 15 seconds", android.R.drawable.ic_media_rew).build())
                    .addCustomAction(new PlaybackState.CustomAction.Builder(FWD30, "Forward 30 seconds", android.R.drawable.ic_media_ff).build())
                    .build());
            MediaMetadata.Builder m = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, o.optString("title"))
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, o.optString("show"))
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, o.optString("show"));
            long dur = o.optLong("dur", 0);
            if (dur > 0) m.putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
            if (art != null && artFor.equals(o.optString("image", ""))) m.putBitmap(MediaMetadata.METADATA_KEY_ART, art);
            session.setMetadata(m.build());
        } catch (Exception ignored) { }
    }

    /** The show's artwork for the notification and lock screen, fetched once per show. */
    private void loadArt(String url) {
        if (url == null || url.isEmpty() || url.equals(artFor) || !url.startsWith("http")) return;
        artFor = url;
        art = null;
        new Thread(() -> {
            Bitmap b = null;
            try {
                byte[] data = PodFeed.get(url, 4 * 1024 * 1024);
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(data, 0, data.length, o);
                int s = 1;
                while (o.outWidth / (s * 2) >= 512 && o.outHeight / (s * 2) >= 512) s *= 2;
                BitmapFactory.Options o2 = new BitmapFactory.Options();
                o2.inSampleSize = s;
                b = BitmapFactory.decodeByteArray(data, 0, data.length, o2);
            } catch (Exception | OutOfMemoryError ignored) { }
            final Bitmap got = b;
            main.post(() -> {
                if (!url.equals(artFor) || got == null) return;
                art = got;
                if (Podcast.state() != Podcast.IDLE) onPodState(Podcast.status());
            });
        }, "podcast-art").start();
    }

    /* ---------- the notification ---------- */

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Podcasts", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shown while a podcast plays, with Back, Pause, Forward and Stop");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private Intent openIntent() {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return open;
    }

    private static JSONObject parse(String json) {
        try {
            return new JSONObject(json);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static String clock(long ms) {
        long s = Math.max(0, ms / 1000);
        long h = s / 3600;
        long m = (s % 3600) / 60;
        long sec = s % 60;
        return h > 0 ? String.format(java.util.Locale.UK, "%d:%02d:%02d", h, m, sec) : String.format(java.util.Locale.UK, "%d:%02d", m, sec);
    }

    private Notification build(String json) {
        JSONObject o = parse(json);
        String st = o.optString("state");
        boolean playing = "playing".equals(st) || "loading".equals(st);
        String title = o.optString("title", "");
        if (title.isEmpty()) title = "Podcast";
        String show = o.optString("show", "");
        long pos = o.optLong("pos", 0);
        long dur = o.optLong("dur", 0);
        String where = "loading".equals(st) ? "Loading" : (playing ? "" : "Paused, ") + clock(pos) + (dur > 0 ? " of " + clock(dur) : "");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        PendingIntent openPi = PendingIntent.getActivity(this, 331, openIntent(), flags);
        PendingIntent backPi = PendingIntent.getService(this, 332, new Intent(this, PodcastService.class).setAction(ACTION_BACK), flags);
        PendingIntent togglePi = PendingIntent.getService(this, 333, new Intent(this, PodcastService.class).setAction(ACTION_TOGGLE), flags);
        PendingIntent fwdPi = PendingIntent.getService(this, 334, new Intent(this, PodcastService.class).setAction(ACTION_FORWARD), flags);
        PendingIntent stopPi = PendingIntent.getService(this, 335, new Intent(this, PodcastService.class).setAction(ACTION_STOP), flags);

        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
                .setContentTitle(title)
                .setContentText(show.isEmpty() ? where : show + " · " + where)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(playing)
                .setContentIntent(openPi)
                .setDeleteIntent(stopPi)
                .addAction(new Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_media_rew), "Back 15 seconds", backPi).build())
                .addAction(new Notification.Action.Builder(Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play), playing ? "Pause" : "Play", togglePi).build())
                .addAction(new Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_media_ff), "Forward 30 seconds", fwdPi).build())
                .addAction(new Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "Stop", stopPi).build());
        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (session != null) style.setMediaSession(session.getSessionToken());
        b.setStyle(style);
        if (art != null && artFor.equals(o.optString("image", ""))) b.setLargeIcon(art);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }
}
