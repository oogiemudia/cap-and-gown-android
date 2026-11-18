package io.github.oogiemudia.capgown;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Shows the planner (bundled in the app) and links it to the alarms through the AndroidApp bridge.
 * The Chat tab's claude.ai view (ChatPane) sits in the same frame, on top of the planner.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    static final int REQ_FILE = 11;
    static final int REQ_NOTIFY = 12;
    static final int REQ_MIC = 13;

    private FrameLayout root;
    private WebView web;
    ChatPane chat;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingMedia;
    private boolean loaded;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String pendingSpeech;

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
        handleIntent(getIntent());
        askForNotificationsOnce();
        Alarms.scheduleNext(this);
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
        if (chat != null) chat.resume();
        if (loaded) js("window.__capgownResume && window.__capgownResume()");
    }

    @Override
    protected void onPause() {
        if (chat != null) chat.pause();
        super.onPause();
    }

    /** Reads lesson text aloud with the phone's own voice (Learn, Audio summary). */
    void speak(String text) {
        runOnUiThread(() -> {
            if (tts == null) {
                pendingSpeech = text;
                tts = new TextToSpeech(this, status -> {
                    ttsReady = status == TextToSpeech.SUCCESS;
                    if (!ttsReady) {
                        toastNative("Read aloud is not available on this phone.");
                        return;
                    }
                    tts.setLanguage(Locale.UK);
                    if (pendingSpeech != null) {
                        tts.speak(pendingSpeech, TextToSpeech.QUEUE_FLUSH, null, "capgown");
                        pendingSpeech = null;
                    }
                });
                return;
            }
            if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "capgown");
            else pendingSpeech = text;
        });
    }

    void stopSpeaking() {
        runOnUiThread(() -> {
            if (tts != null) tts.stop();
        });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
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
                InputStream in = getAssets().open(name);
                return new WebResourceResponse(mime(name), "utf-8", in);
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
