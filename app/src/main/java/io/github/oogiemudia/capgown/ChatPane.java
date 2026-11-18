package io.github.oogiemudia.capgown;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Base64;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Chat tab: claude.ai in a second web view, signed in to your own Claude account.
 * The planner page says where it goes (between its top bar and its tab bar) and this class
 * puts it there. It stays loaded while the app is open, so switching tabs keeps your chat.
 * It also handles sign-in links, attaching files, the microphone and downloads.
 */
final class ChatPane {

    static final String NEW_CHAT = "https://claude.ai/new";
    private static final Pattern LINK = Pattern.compile("https://[^\\s\"'<>]+");

    private final MainActivity activity;
    private final FrameLayout root;
    private WebView web;
    private boolean shown;
    private volatile long downloadUntil;
    private volatile String downloadName = "download";

    ChatPane(MainActivity activity, FrameLayout root) {
        this.activity = activity;
        this.root = root;
    }

    /** Sites that stay inside the Chat tab. Everything else opens in the phone's browser. */
    static boolean allowedHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("claude.ai") || h.endsWith(".claude.ai")
                || h.equals("claude.com") || h.endsWith(".claude.com")
                || h.equals("anthropic.com") || h.endsWith(".anthropic.com")
                || h.endsWith(".claudeusercontent.com")
                || h.equals("appleid.apple.com")
                || h.equals("challenges.cloudflare.com");
    }

    private static String safeStart(String url) {
        try {
            Uri u = Uri.parse(url);
            if ("https".equals(u.getScheme()) && allowedHost(u.getHost())) return url;
        } catch (Exception ignored) { }
        return NEW_CHAT;
    }

    static boolean copy(Context context, String text) {
        ClipboardManager cb = context.getSystemService(ClipboardManager.class);
        if (cb == null) return false;
        try {
            cb.setPrimaryClip(ClipData.newPlainText("Cap and Gown", text));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    boolean isShown() {
        return shown && web != null;
    }

    String currentUrl() {
        return web == null ? null : web.getUrl();
    }

    /** Places the chat between the planner's bars. Sizes come from the page in CSS pixels. */
    void show(int topCss, int bottomCss, int cssWidth, String startUrl) {
        if (web == null) create(startUrl);
        float ratio = root.getWidth() > 0 && cssWidth > 0
                ? (float) root.getWidth() / cssWidth
                : activity.getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
        int top = Math.round(topCss * ratio);
        int bottom = Math.round(bottomCss * ratio);
        if (lp.topMargin != top || lp.bottomMargin != bottom) {
            lp.topMargin = top;
            lp.bottomMargin = bottom;
            web.setLayoutParams(lp);
        }
        if (web.getVisibility() != View.VISIBLE) web.setVisibility(View.VISIBLE);
        shown = true;
    }

    void hide() {
        shown = false;
        if (web == null) return;
        if (web.hasFocus()) {
            InputMethodManager imm = activity.getSystemService(InputMethodManager.class);
            if (imm != null) imm.hideSoftInputFromWindow(web.getWindowToken(), 0);
            web.clearFocus();
        }
        if (web.getVisibility() != View.GONE) web.setVisibility(View.GONE);
    }

    void go(String url) {
        if (web == null) create(url);
        else web.loadUrl(safeStart(url));
    }

    /** Any https link, used for a sign-in link pasted from the email (it may pass through a redirect first). */
    void load(String link) {
        if (web == null) create(NEW_CHAT);
        web.loadUrl(link);
    }

    void reload() {
        if (web != null) web.reload();
    }

    /** Back inside the chat, if there is somewhere to go back to. */
    boolean back() {
        if (web != null && shown && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return false;
    }

    void signOut() {
        CookieManager cm = CookieManager.getInstance();
        cm.removeAllCookies(done -> {
            cm.flush();
            if (web != null) {
                web.clearCache(true);
                web.clearHistory();
                web.loadUrl("https://claude.ai/login");
            }
        });
    }

    /** Reads the clipboard: the link itself, or "empty" or "nolink". */
    String readCopiedLink() {
        ClipboardManager cb = activity.getSystemService(ClipboardManager.class);
        if (cb == null || !cb.hasPrimaryClip()) return "empty";
        ClipData clip = cb.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return "empty";
        CharSequence cs = clip.getItemAt(0).coerceToText(activity);
        String text = cs == null ? "" : cs.toString().trim();
        if (text.isEmpty()) return "empty";
        Matcher m = LINK.matcher(text);
        return m.find() ? m.group() : "nolink";
    }

    /** Puts text in the message box (and on the clipboard, in case the page has changed). */
    void insert(String text) {
        copy(activity, text);
        if (web == null) {
            activity.js("window.__capgownChatInserted && window.__capgownChatInserted(false)");
            return;
        }
        String js = "(function(t){try{"
                + "var el=document.querySelector('div.ProseMirror[contenteditable=\"true\"]')"
                + "||document.querySelector('[contenteditable=\"true\"]')||document.querySelector('textarea');"
                + "if(!el)return false;el.focus();"
                + "if(el.tagName==='TEXTAREA'){var set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;"
                + "set.call(el,(el.value?el.value+'\\n\\n':'')+t);el.dispatchEvent(new Event('input',{bubbles:true}));return true;}"
                + "var s=window.getSelection();var r=document.createRange();r.selectNodeContents(el);r.collapse(false);"
                + "s.removeAllRanges();s.addRange(r);"
                + "var dt=new DataTransfer();dt.setData('text/plain',t);"
                + "var ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});el.dispatchEvent(ev);"
                + "if(ev.defaultPrevented)return true;"
                + "return document.execCommand('insertText',false,t);"
                + "}catch(e){return false;}})(" + JSONObject.quote(text) + ")";
        web.evaluateJavascript(js, v -> activity.js("window.__capgownChatInserted && window.__capgownChatInserted("
                + ("true".equals(v) ? "true" : "false") + ")"));
    }

    void pause() {
        CookieManager.getInstance().flush();
        if (web != null) web.onPause();
    }

    void resume() {
        if (web != null) web.onResume();
    }

    void destroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void create(String startUrl) {
        web = new WebView(activity);
        boolean night = (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        web.setBackgroundColor(night ? 0xFF262624 : 0xFFFAF9F5);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setSupportMultipleWindows(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        ws.setMediaPlaybackRequiresUserGesture(false);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new Downloads(), "CapGownChat");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(this::onDownload);
        web.setVisibility(View.GONE);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web.loadUrl(safeStart(startUrl));
    }

    private void event(String type, String url) {
        activity.js("window.__capgownChatEvent && window.__capgownChatEvent(" + JSONObject.quote(type) + ","
                + JSONObject.quote(url == null ? "" : url) + ")");
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            if (scheme.equals("https") || scheme.equals("http")) {
                if (host.equals("accounts.google.com")) {
                    activity.toastNative("Google sign-in does not work inside apps. Tap Continue with email and use the same address.");
                    return true;
                }
                if (allowedHost(host) || !request.isForMainFrame()) return false;
            }
            activity.openOutside(u);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            event("start", url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            event("page", url);
            CookieManager.getInstance().flush();
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            event("page", url);
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            boolean many = params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
            return activity.chooseFiles(callback, many, "Attach to your chat");
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            activity.runOnUiThread(() -> activity.handleMediaRequest(request));
        }
    }

    // Downloads: ordinary links go to the phone's download manager; files made in the page
    // (blob: links) are read by the page and handed over here, only straight after a download starts.
    private void onDownload(String url, String userAgent, String contentDisposition, String mimeType, long length) {
        String name = Files.safeName(URLUtil.guessFileName(url, contentDisposition, mimeType));
        if (url.startsWith("blob:")) {
            downloadName = name;
            downloadUntil = System.currentTimeMillis() + 30_000;
            String js = "(function(u){fetch(u).then(function(r){return r.blob();}).then(function(b){"
                    + "var f=new FileReader();f.onloadend=function(){CapGownChat.save(String(f.result));};f.readAsDataURL(b);"
                    + "}).catch(function(){CapGownChat.failed();});})(" + JSONObject.quote(url) + ")";
            web.evaluateJavascript(js, null);
            return;
        }
        if (url.startsWith("data:")) {
            String dataUrl = url;
            new Thread(() -> saveDataUrl(dataUrl, name)).start();
            return;
        }
        if (Build.VERSION.SDK_INT >= 29 && url.startsWith("https:")) {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) r.addRequestHeader("Cookie", cookie);
                if (userAgent != null) r.addRequestHeader("User-Agent", userAgent);
                if (mimeType != null && !mimeType.isEmpty()) r.setMimeType(mimeType);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = activity.getSystemService(DownloadManager.class);
                if (dm != null) {
                    dm.enqueue(r);
                    activity.toastNative("Downloading " + name + " to your Downloads folder.");
                    return;
                }
            } catch (Exception ignored) { }
        }
        activity.openOutside(Uri.parse(url));
    }

    private void saveDataUrl(String dataUrl, String name) {
        int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
        if (comma < 5 || !dataUrl.startsWith("data:") || dataUrl.length() > 40_000_000) {
            activity.toastNative("That file could not be saved from here.");
            return;
        }
        String meta = dataUrl.substring(5, comma);
        boolean b64 = meta.endsWith(";base64");
        String mime = b64 ? meta.substring(0, meta.length() - 7) : meta;
        int semi = mime.indexOf(';');
        if (semi >= 0) mime = mime.substring(0, semi);
        byte[] bytes;
        try {
            bytes = b64 ? Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
                    : Uri.decode(dataUrl.substring(comma + 1)).getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            activity.toastNative("That file could not be saved from here.");
            return;
        }
        boolean ok = Files.saveToDownloads(activity, name, bytes, mime);
        activity.toastNative(ok ? "Saved " + name + " to your Downloads folder."
                : "That file could not be saved. Open the chat in your browser to download it.");
    }

    private class Downloads {
        @JavascriptInterface
        public void save(String dataUrl) {
            if (System.currentTimeMillis() > downloadUntil) return;
            downloadUntil = 0;
            String name = downloadName;
            new Thread(() -> saveDataUrl(dataUrl, name)).start();
        }

        @JavascriptInterface
        public void failed() {
            if (System.currentTimeMillis() > downloadUntil) return;
            downloadUntil = 0;
            activity.toastNative("That file could not be saved from here. Open the chat in your browser to download it.");
        }
    }
}
