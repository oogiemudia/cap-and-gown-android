package io.github.oogiemudia.capgown;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Shows the planner (bundled in the app) and links it to the alarms through the AndroidApp bridge. */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    static final int REQ_FILE = 11;
    static final int REQ_NOTIFY = 12;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean loaded;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AlarmService.ensureChannels(this);

        web = new WebView(this);
        setContentView(web);
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
        if (loaded) js("window.__capgownResume && window.__capgownResume()");
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
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

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (loaded) js("window.__capgownResume && window.__capgownResume()");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
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
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) { }
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
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(pick, "Choose your backup file"), REQ_FILE);
                return true;
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
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
