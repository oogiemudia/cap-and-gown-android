package io.github.oogiemudia.capgown;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * The online library, inside the app: the Padlet reading list, the Ann Gravells reading list, and every
 * reading, video and podcast the Study tab recommends open here, with the app one tap away.
 * "Save" keeps the page you are on in the app's Library. "Listen to this page" reads it aloud (ReadAloud),
 * and carries on when you leave the page or turn the screen off.
 */
public class ReaderActivity extends Activity implements ReadAloud.Listener {

    static final String EXTRA_URL = "url";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_LISTEN = "listen";
    private static final double[] SPEEDS = {0.8, 1, 1.25, 1.5, 2};

    /**
     * Collects the words of the page for reading aloud: what you have selected, or else the headings and
     * paragraphs of the article, leaving out menus, footers, forms and cookie notices.
     */
    private static final String GRAB = "(function(){try{"
            + "var sel=String(window.getSelection?window.getSelection():'');"
            + "if(sel&&sel.trim().length>40)return JSON.stringify({t:document.title||'',x:sel.slice(0,600000),sel:true});"
            + "var SKIP='nav,aside,form,button,script,style,noscript,[aria-hidden=true],[role=navigation],[role=dialog],[aria-modal=true],[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i]';"
            + "var BLOCK='h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,pre,td,th';"
            + "function grab(root){var out=[],nodes=root.querySelectorAll(BLOCK);"
            + "for(var i=0;i<nodes.length&&out.length<20000;i++){var el=nodes[i];"
            + "var c=el.closest(SKIP);if(c&&c!==document.body&&c!==document.documentElement&&!c.contains(root))continue;"
            + "var edge=el.closest('header,footer');if(edge&&!edge.closest('article'))continue;"
            + "if(el.querySelector(BLOCK))continue;"
            + "if(!el.getClientRects().length)continue;"
            + "var t=(el.innerText||'').replace(/\\s+/g,' ').trim();if(!t)continue;"
            + "out.push(/[.!?:;\\u2026][\"'\\u201d\\u2019)\\]]*$/.test(t)?t:t+'.');}"
            + "return out.join('\\n');}"
            + "var root=document.querySelector('article')||document.querySelector('main')||document.querySelector('[role=main]')||document.body;"
            + "var x=grab(root);"
            + "if(x.length<400&&root!==document.body)x=grab(document.body);"
            + "if(x.length<400){var b=(document.body.innerText||'').trim();if(b.length>x.length)x=b;}"
            + "return JSON.stringify({t:document.title||'',x:x.slice(0,600000),sel:false});"
            + "}catch(e){return JSON.stringify({t:'',x:'',sel:false});}})()";
    private static final String KEY_SAVED = "readerSaved";
    private static final int BAR = 0xFF14121F;

    private FrameLayout root;
    private LinearLayout page;
    private WebView web;
    private TextView titleView;
    private TextView hostView;
    private ProgressBar progress;
    private View fullView;
    private WebChromeClient.CustomViewCallback fullCallback;
    private boolean shownSomething;
    private boolean listenWhenLoaded;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout listenControls;
    private TextView listenIdle;
    private TextView listenText;
    private TextView listenToggle;
    private TextView listenSpeed;
    private double listenRate = 1;

    static boolean canOpen(String url) {
        return url != null && url.startsWith("https://") && url.length() < 2000;
    }

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        if (!canOpen(url)) {
            finish();
            return;
        }

        root = new FrameLayout(this);
        page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        root.addView(page, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BAR);
        bar.setPadding(dp(4), dp(4), dp(4), dp(4));
        bar.addView(button("Close", v -> finish()));

        LinearLayout names = new LinearLayout(this);
        names.setOrientation(LinearLayout.VERTICAL);
        names.setPadding(dp(6), 0, dp(6), 0);
        titleView = new TextView(this);
        titleView.setTextColor(0xFFFFFFFF);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setText(title == null || title.isEmpty() ? "Online library" : title);
        hostView = new TextView(this);
        hostView.setTextColor(0xB3FFFFFF);
        hostView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        hostView.setSingleLine(true);
        hostView.setEllipsize(TextUtils.TruncateAt.END);
        hostView.setText(hostOf(url));
        names.addView(titleView);
        names.addView(hostView);
        bar.addView(names, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        bar.addView(button("Save", v -> save()));
        bar.addView(button("Browser", v -> openOutside(currentUrl())));
        page.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        page.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setSupportMultipleWindows(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        ws.setBuiltInZoomControls(true);
        ws.setDisplayZoomControls(false);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        // The app cannot show a PDF or a file itself, so those go to the phone's own browser or PDF app.
        web.setDownloadListener((u, agent, disposition, mime, length) -> {
            openOutside(u);
            if (!shownSomething) finish();
        });
        page.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        page.addView(listenBar(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
        listenWhenLoaded = savedInstanceState == null && getIntent().getBooleanExtra(EXTRA_LISTEN, false);
        ReadAloud.addListener(this);
        onListenState(ReadAloud.status());
        web.loadUrl(url);
    }

    /* ---------- Listen ---------- */

    /** The strip under the page: "Listen to this page", or the player while something is being read. */
    private View listenBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.setBackgroundColor(BAR);
        bar.setPadding(dp(4), dp(2), dp(4), dp(2));

        listenText = new TextView(this);
        listenText.setTextColor(0xB3FFFFFF);
        listenText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        listenText.setSingleLine(true);
        listenText.setEllipsize(TextUtils.TruncateAt.END);
        listenText.setPadding(dp(10), dp(4), dp(10), 0);
        listenText.setVisibility(View.GONE);
        bar.addView(listenText);

        listenIdle = button("Listen to this page", v -> listenToPage(true));
        bar.addView(listenIdle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        listenControls = new LinearLayout(this);
        listenControls.setOrientation(LinearLayout.HORIZONTAL);
        listenControls.setGravity(Gravity.CENTER_VERTICAL);
        listenToggle = button("Pause", v -> ReadAloud.toggle());
        listenSpeed = button("1x", v -> nextSpeed());
        TextView[] controls = {
            button("Back", v -> ReadAloud.skip(-1)),
            listenToggle,
            button("Next", v -> ReadAloud.skip(1)),
            listenSpeed,
            button("Stop", v -> ReadAloud.stop())
        };
        for (TextView b : controls) {
            // Five across a narrow phone: one line each, and the letters shrink before they would be cut off.
            b.setPadding(dp(2), dp(8), dp(2), dp(8));
            b.setMinWidth(0);
            b.setMaxLines(1);
            b.setAutoSizeTextTypeUniformWithConfiguration(9, 14, 1, TypedValue.COMPLEX_UNIT_SP);
            listenControls.addView(b, new LinearLayout.LayoutParams(0, dp(44), 1f));
        }
        listenSpeed.setContentDescription("Reading speed");
        listenControls.setVisibility(View.GONE);
        bar.addView(listenControls, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return bar;
    }

    private void nextSpeed() {
        int at = 0;
        for (int i = 0; i < SPEEDS.length; i++) {
            if (Math.abs(SPEEDS[i] - listenRate) < Math.abs(SPEEDS[at] - listenRate)) at = i;
        }
        ReadAloud.setRate(SPEEDS[(at + 1) % SPEEDS.length]);
    }

    private static String speedLabel(double r) {
        String s = String.valueOf(Math.round(r * 100) / 100.0);
        if (s.endsWith(".0")) s = s.substring(0, s.length() - 2);
        return s + "x";
    }

    /** Reads the page you are on aloud. With asked, it says so when the page has nothing it can read. */
    private void listenToPage(boolean asked) {
        if (web == null) return;
        web.evaluateJavascript(GRAB, value -> {
            if (web == null || isFinishing()) return;
            String text = "";
            String title = "";
            try {
                Object v = new JSONTokener(value == null ? "\"\"" : value).nextValue();
                JSONObject o = new JSONObject(String.valueOf(v));
                text = o.optString("x", "").trim();
                title = o.optString("t", "").trim();
            } catch (Exception ignored) { }
            if (title.isEmpty() || title.startsWith("http")) title = String.valueOf(titleView.getText());
            if (text.length() < 200) {
                if (asked || text.isEmpty()) {
                    Toast.makeText(this, "There are not enough words on this page to read aloud. Videos, pictures and PDF files cannot be read.", Toast.LENGTH_LONG).show();
                }
                if (text.isEmpty()) return;
            }
            if (!ReadAloud.play(this, title, text)) {
                Toast.makeText(this, "There are no words on this page to read aloud.", Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    public void onListenState(String json) {
        if (listenControls == null) return;
        JSONObject o;
        try {
            o = new JSONObject(json);
        } catch (Exception e) {
            o = new JSONObject();
        }
        String state = o.optString("state", "idle");
        boolean on = !"idle".equals(state);
        listenRate = o.optDouble("rate", 1);
        listenIdle.setVisibility(on ? View.GONE : View.VISIBLE);
        listenControls.setVisibility(on ? View.VISIBLE : View.GONE);
        listenText.setVisibility(on ? View.VISIBLE : View.GONE);
        if (on) {
            boolean playing = "playing".equals(state);
            listenToggle.setText(playing ? "Pause" : "Play");
            listenToggle.setContentDescription(playing ? "Pause" : "Play");
            listenSpeed.setText(speedLabel(listenRate));
            int n = o.optInt("n", 0);
            listenText.setText((playing ? "Reading" : "Paused") + (n > 0 ? ", part " + o.optInt("i", 1) + " of " + n : "") + ": " + o.optString("title", ""));
        } else {
            String error = o.optString("error", "");
            if (!error.isEmpty() && hasWindowFocus()) Toast.makeText(this, error, Toast.LENGTH_LONG).show();
        }
    }

    private TextView button(String label, View.OnClickListener on) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setTextColor(0xFFFFFFFF);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER);
        b.setMinHeight(dp(44));
        b.setMinWidth(dp(48));
        b.setPadding(dp(10), dp(8), dp(10), dp(8));
        TypedValue tv = new TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true)) {
            b.setBackgroundResource(tv.resourceId);
        }
        b.setClickable(true);
        b.setFocusable(true);
        b.setContentDescription(label);
        b.setOnClickListener(on);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static String hostOf(String url) {
        try {
            String h = Uri.parse(url).getHost();
            if (h == null) return "";
            return h.startsWith("www.") ? h.substring(4) : h;
        } catch (Exception e) {
            return "";
        }
    }

    private String currentUrl() {
        String u = web == null ? null : web.getUrl();
        return u == null || u.isEmpty() ? getIntent().getStringExtra(EXTRA_URL) : u;
    }

    private void openOutside(String url) {
        if (url == null) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            Toast.makeText(this, "No app on this phone can open that link.", Toast.LENGTH_LONG).show();
        }
    }

    /** Keeps the page you are on for the app's Library. The planner page collects these when you come back. */
    private void save() {
        String url = currentUrl();
        if (!canOpen(url)) {
            Toast.makeText(this, "This page cannot be saved.", Toast.LENGTH_SHORT).show();
            return;
        }
        String title = web != null && web.getTitle() != null && !web.getTitle().isEmpty() ? web.getTitle() : String.valueOf(titleView.getText());
        if (title.length() > 160) title = title.substring(0, 160);
        try {
            SharedPreferences p = Alarms.prefs(this);
            JSONArray list;
            synchronized (ReaderActivity.class) {
                list = new JSONArray(p.getString(KEY_SAVED, "[]"));
                for (int i = 0; i < list.length(); i++) {
                    if (url.equals(list.getJSONObject(i).optString("url"))) {
                        Toast.makeText(this, "Already saved. It will be in your Library.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                }
                if (list.length() >= 50) {
                    Toast.makeText(this, "Go back to the app first, so these are filed.", Toast.LENGTH_LONG).show();
                    return;
                }
                list.put(new JSONObject().put("url", url).put("title", title));
                p.edit().putString(KEY_SAVED, list.toString()).apply();
            }
            Toast.makeText(this, "Saved to your Library.", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Could not save this page.", Toast.LENGTH_SHORT).show();
        }
    }

    /** The pages saved in the reader since the planner last asked, as a JSON list. Asking empties it. */
    static String takeSaved(Context c) {
        SharedPreferences p = Alarms.prefs(c);
        synchronized (ReaderActivity.class) {
            String s = p.getString(KEY_SAVED, "[]");
            if (!"[]".equals(s)) p.edit().remove(KEY_SAVED).apply();
            return s;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (fullView != null) {
            hideFull();
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        finish();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        ReadAloud.removeListener(this);
        handler.removeCallbacksAndMessages(null);
        if (fullView != null) hideFull();
        if (web != null) {
            if (page != null) page.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void hideFull() {
        if (fullView == null) return;
        root.removeView(fullView);
        fullView = null;
        page.setVisibility(View.VISIBLE);
        if (fullCallback != null) {
            try {
                fullCallback.onCustomViewHidden();
            } catch (Exception ignored) { }
            fullCallback = null;
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            if (scheme.equals("https")) return false;
            if (scheme.equals("intent")) {
                // A page asking to open another app (a podcast or video app). Use the web address it offers instead.
                try {
                    Intent in = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                    String fallback = in.getStringExtra("browser_fallback_url");
                    if (canOpen(fallback)) view.loadUrl(fallback);
                } catch (Exception ignored) { }
                return true;
            }
            if (scheme.equals("http")) {
                // The app only loads secure pages, so a plain http link goes to the phone's browser.
                if (request.isForMainFrame()) openOutside(u.toString());
                return true;
            }
            if (scheme.equals("mailto") || scheme.equals("tel")) {
                if (request.hasGesture()) openOutside(u.toString());
                return true;
            }
            // Any other kind of link is ignored, so a page cannot start another app on its own.
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            hostView.setText(hostOf(url));
            progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (listenWhenLoaded) {
                // Opened with Listen: give the page a moment to fill in, then start reading.
                listenWhenLoaded = false;
                handler.postDelayed(() -> listenToPage(true), 1500);
            }
            shownSomething = true;
            progress.setVisibility(View.INVISIBLE);
            String t = view.getTitle();
            if (t != null && !t.isEmpty() && !t.startsWith("http")) titleView.setText(t);
            hostView.setText(hostOf(url));
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int value) {
            progress.setProgress(value);
            if (value >= 100) progress.setVisibility(View.INVISIBLE);
        }

        @Override
        public void onReceivedTitle(WebView view, String t) {
            if (t != null && !t.isEmpty() && !t.startsWith("http")) titleView.setText(t);
        }

        /** Full-screen video. */
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullView != null) {
                callback.onCustomViewHidden();
                return;
            }
            fullView = view;
            fullCallback = callback;
            view.setBackgroundColor(0xFF000000);
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            page.setVisibility(View.GONE);
        }

        @Override
        public void onHideCustomView() {
            hideFull();
        }
    }
}
