package io.github.oogiemudia.capgown;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Shows the planner (bundled in the app) and links it to the alarms through the AndroidApp bridge.
 * The Chat tab's claude.ai view (ChatPane) sits in the same frame, on top of the planner.
 */
public class MainActivity extends Activity implements ReadAloud.Listener, Podcast.Listener {

    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    static final int REQ_FILE = 11;
    static final int REQ_NOTIFY = 12;
    static final int REQ_MIC = 13;
    static final int REQ_DICTATE = 14;

    private FrameLayout root;
    private WebView web;
    ChatPane chat;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingMedia;
    private boolean loaded;
    private Dictation dictation;
    private boolean dictateMeeting; // the listening asked for is a whole meeting, not a few sentences
    private boolean onScreen;       // between onResume and onPause
    private boolean meetingPaused;  // Pause was tapped on the meeting's notice

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AlarmService.ensureChannels(this);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        chat = new ChatPane(this, root);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setSupportMultipleWindows(false);
        ws.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new Bridge(this), "AndroidApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        String view = getIntent().getStringExtra("view");
        web.loadUrl(START + (view != null ? "#" + view : ""));
        ReadAloud.init(this);
        ReadAloud.addListener(this);
        Podcast.init(this);
        Podcast.addListener(this);
        handleIntent(getIntent());
        askForNotificationsOnce();
        Alarms.scheduleNext(this);
        checkForUpdate(false);
    }

    /** Looks for a newer planner page on GitHub (see LiveUpdate) and tells the page what it found. */
    void checkForUpdate(boolean asked) {
        LiveUpdate.check(this, asked, (state, page) -> {
            if (!loaded) return;
            if (asked) js("window.__capgownUpdateResult && window.__capgownUpdateResult('" + state + "'," + page + ")");
            else if ("ready".equals(state)) js("window.__capgownUpdateReady && window.__capgownUpdateReady(" + page + ")");
        });
    }

    /** Loads the planner page again, so a newer page (or the built-in one, after going back) shows. */
    void reloadPage() {
        runOnUiThread(() -> {
            if (web == null) return;
            if (dictation != null) dictation.cancel();
            if (chat != null) chat.hide();
            loaded = false;
            web.loadUrl(START);
        });
    }

    /** Opens a web page in the in-app reader. With listen, the reader starts reading it aloud once it has loaded. */
    void openReader(String url, String title, boolean listen) {
        try {
            startActivity(new Intent(this, ReaderActivity.class)
                    .putExtra(ReaderActivity.EXTRA_URL, url)
                    .putExtra(ReaderActivity.EXTRA_TITLE, title == null ? "" : title)
                    .putExtra(ReaderActivity.EXTRA_LISTEN, listen));
        } catch (Exception e) {
            openOutside(Uri.parse(url));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        String view = intent.getStringExtra("view");
        if (view != null && loaded) js("window.__capgownGo && window.__capgownGo('" + view.replaceAll("[^a-z]", "") + "')");
    }

    @Override
    protected void onResume() {
        super.onResume();
        onScreen = true;
        if (chat != null) chat.resume();
        if (loaded) {
            js("window.__capgownResume && window.__capgownResume()");
            checkForUpdate(false);
        }
    }

    @Override
    protected void onPause() {
        // The microphone is not left on once the app is off the screen, with one exception: a mentor meeting
        // that is being listened to under its own notice (MeetingService). What was heard is kept.
        onScreen = false;
        if (dictation != null && !(dictation.inMeeting() && MeetingService.running())) dictation.cancel();
        if (chat != null) chat.pause();
        super.onPause();
    }

    /* ---------- Listen: the page's player follows what ReadAloud is doing ---------- */

    @Override
    public void onListenState(String json) {
        if (loaded) js("window.__capgownListen && window.__capgownListen(" + json + ")");
    }

    /* ---------- Podcasts: the page's player follows what Podcast is doing ---------- */

    @Override
    public void onPodState(String json) {
        if (loaded) js("window.__capgownPod && window.__capgownPod(" + json + ")");
    }

    /** Episode lists come back here from PodFeed, off the main thread. */
    void podFeedResult(String req, String json) {
        if (loaded) js("window.__capgownPodFeed && window.__capgownPodFeed(" + JSONObject.quote(req) + "," + json + ")");
    }

    /* ---------- Speak: speech to text for the page's writing boxes ---------- */

    void startDictation() {
        startDictation(false);
    }

    /** wholeMeeting: keep listening through pauses, for the mentor meeting listener. */
    void startDictation(boolean wholeMeeting) {
        runOnUiThread(() -> {
            // A meeting that was being listened to must not start again while the app is off the screen:
            // the page asks again when the app comes back.
            if (wholeMeeting && !onScreen) {
                tellDictation("end", "away");
                return;
            }
            dictateMeeting = wholeMeeting;
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_DICTATE);
                return;
            }
            beginDictation();
        });
    }

    private void beginDictation() {
        if (dictation == null) dictation = new Dictation(this, this::tellDictation);
        ReadAloud.pause(); // so the phone does not write down its own voice
        Podcast.pause(); // or the podcast
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        meetingPaused = false;
        dictation.start(dictateMeeting);
        // A meeting carries on with the phone locked or another app open, under a notice with a Pause button.
        // The notice has to go up now, while the app is on the screen.
        if (dictateMeeting && dictation.inMeeting()) MeetingService.start(this, this::pauseMeeting);
    }

    /** Pause on the meeting's notice: stop listening and tell the page it was paused, not cut off. */
    private void pauseMeeting() {
        runOnUiThread(() -> {
            if (dictation == null || !dictation.active()) {
                MeetingService.stop();
                return;
            }
            meetingPaused = true;
            dictation.stop();
        });
    }

    /** True once a meeting may carry on off the screen (its notice is up). */
    boolean meetingInBackground() {
        return MeetingService.running();
    }

    void stopDictation() {
        runOnUiThread(() -> {
            if (dictation != null) dictation.stop();
        });
    }

    private void tellDictation(String kind, String text) {
        if ("end".equals(kind)) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            MeetingService.stop();
            if (meetingPaused) {
                meetingPaused = false;
                if (text.isEmpty()) text = "paused";
            } else if (dictateMeeting && !onScreen && ("denied".equals(text) || "mic".equals(text))) {
                text = "locked"; // the phone took the microphone away because the app was off the screen
            }
        }
        if (web != null && loaded) {
            js("window.__capgownDictate && window.__capgownDictate(" + JSONObject.quote(kind) + "," + JSONObject.quote(text) + ")");
        }
    }

    @Override
    protected void onDestroy() {
        ReadAloud.removeListener(this);
        Podcast.removeListener(this);
        if (dictation != null) dictation.cancel();
        if (chat != null) chat.destroy();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Back: inside the chat first, then the planner's own screens and sheets, then leave the app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (chat != null && chat.back()) return;
        if (web == null || !loaded) {
            moveTaskToBack(true);
            return;
        }
        web.evaluateJavascript("(function(){try{return window.__capgownBack?!!window.__capgownBack():false;}catch(e){return false;}})()", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    private void handleIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("stopAlarm", false)) {
            try {
                startService(new Intent(this, AlarmService.class).setAction(AlarmService.ACTION_STOP));
            } catch (Exception ignored) { }
            intent.removeExtra("stopAlarm");
        }
        handleShared(intent);
    }

    /**
     * "Share" from another app (a web page from the browser, or words you selected) reads it aloud here.
     * A link opens in the reader and is read from there; anything else is read as it is.
     */
    private void handleShared(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        String text = null;
        String subject = null;
        try {
            CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            text = t == null ? null : t.toString().trim();
            subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        } catch (Exception ignored) { }
        intent.setAction(Intent.ACTION_MAIN); // handled once, not again when the screen is rebuilt
        intent.removeExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;
        if (text.length() > 600_000) text = text.substring(0, 600_000);
        String title = subject == null || subject.trim().isEmpty() ? "Shared with Cap and Gown" : subject.trim();
        // A browser shares a page as its address, sometimes with the title in front of it.
        String link = text.substring(text.lastIndexOf(' ') + 1).trim();
        if (text.length() < 2100 && text.indexOf('\n') < 0 && ReaderActivity.canOpen(link)
                && (link.length() == text.length() || text.length() - link.length() < 200)) {
            openReader(link, subject == null ? "" : subject.trim(), true);
            return;
        }
        if (!ReadAloud.play(this, title, text)) toastNative("There were no words to read in what was shared.");
    }

    void js(String code) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(code, null);
        });
    }

    void toastNative(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    void openOutside(Uri uri) {
        runOnUiThread(() -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) {
                Toast.makeText(this, "No app on this phone can open that link.", Toast.LENGTH_LONG).show();
            }
        });
    }

    void askForNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        if (Alarms.prefs(this).getBoolean("askedNotify", false)) return;
        Alarms.prefs(this).edit().putBoolean("askedNotify", true).apply();
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
    }

    /** Returns false when Android will not show the permission dialog again, so settings must be opened. */
    boolean requestNotifications() {
        if (Build.VERSION.SDK_INT < 33) return false;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return true;
        boolean asked = Alarms.prefs(this).getBoolean("askedNotify", false);
        if (asked && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) return false;
        Alarms.prefs(this).edit().putBoolean("askedNotify", true).apply();
        runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY));
        return true;
    }

    /** The microphone, for talking to Claude in the Chat tab. Only claude.ai can ask, and only for sound. */
    void handleMediaRequest(PermissionRequest request) {
        boolean audio = false;
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
        }
        Uri origin = request.getOrigin();
        if (!audio || origin == null || !ChatPane.allowedHost(origin.getHost())) {
            request.deny();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            return;
        }
        if (pendingMedia != null) pendingMedia.deny();
        pendingMedia = request;
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_DICTATE) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) beginDictation();
            else tellDictation("end", "denied");
        }
        if (requestCode == REQ_MIC && pendingMedia != null) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) pendingMedia.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingMedia.deny();
            pendingMedia = null;
        }
        if (loaded) js("window.__capgownResume && window.__capgownResume()");
    }

    /** File picker for both pages: a backup to restore, or files to attach in the chat. */
    boolean chooseFiles(ValueCallback<Uri[]> callback, boolean many, String title) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        if (many) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try {
            startActivityForResult(Intent.createChooser(pick, title), REQ_FILE);
            return true;
        } catch (Exception e) {
            fileCallback = null;
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
            String name = path.substring(1);
            try {
                InputStream in = null;
                if (name.equals("index.html")) {
                    // A newer planner page kept on the phone wins over the built-in copy (see LiveUpdate).
                    File live = LiveUpdate.current(MainActivity.this);
                    if (live != null) {
                        try {
                            in = new FileInputStream(live);
                        } catch (IOException e) {
                            in = null;
                        }
                    }
                }
                if (in == null) in = getAssets().open(name);
                WebResourceResponse res = new WebResourceResponse(mime(name), "utf-8", in);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                res.setResponseHeaders(headers);
                return res;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (HOST.equals(u.getHost())) return false;
            openOutside(u);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            loaded = true;
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            return chooseFiles(callback, false, "Choose your backup file");
        }
    }

    private static String mime(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "application/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
}
