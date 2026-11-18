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

/**
 * The online library, inside the app: the Padlet reading list, the Ann Gravells reading list, and every
 * reading, video and podcast the Study tab recommends open here, with the app one tap away.
 * "Save" keeps the page you are on in the app's Library.
 */
public class ReaderActivity extends Activity {

    static final String EXTRA_URL = "url";
    static final String EXTRA_TITLE = "title";
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
        setContentView(root);
        web.loadUrl(url);
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
