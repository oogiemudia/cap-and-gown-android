package io.github.oogiemudia.capgown;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.Locale;

/**
 * A lesson video, inside the app, with nothing else on the screen: YouTube's own embedded player on a page of
 * the app's making. The player says where the video has got to, so the app knows when you have finished it
 * and can carry on from where you stopped.
 *
 * YouTube asks an app that shows its player to name itself, as the address the player's page is loaded from
 * (https:// and the app's id). Without that the player shows "error 153". If the player cannot play a video
 * (that error, a video whose owner does not allow players, no answer in time), this screen shows YouTube's own
 * page for the video instead, and the planner asks you how it went when you come back.
 *
 * This web view has no bridge to the planner: what it learns is left in the app's own storage (see take),
 * and the planner collects it when you are back.
 */
public class VideoActivity extends Activity {

    static final String EXTRA_ID = "id";       // the library item, handed back to the planner
    static final String EXTRA_VIDEO = "video"; // YouTube's id for the video
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_START = "start"; // seconds in, to carry on from

    private static final String TAG = "CapGownVideo";
    private static final String KEY_RESULT = "videoResult";
    private static final int BAR = 0xFF14121F;
    private static final long READY_WAIT = 20000; // the player gets this long to answer before YouTube's page is shown

    /** What the player last said, for the test build's self test. Empty when no video is open. */
    static volatile String last = "";
    /** The test build's self test only: leave the player's error on the screen, so the test can read what it says. */
    static volatile boolean holdOnError;
    /**
     * The test build's self test only: a page that stands in for YouTube's player, so that this screen's own part
     * (reading the player, noticing the end, leaving the result) can be tried where YouTube will not play.
     */
    static volatile String testPage;
    /** The screen that is open now. A screen that is closing must not write over what a newer one has left. */
    private static volatile VideoActivity current;

    private FrameLayout root;
    private LinearLayout page;
    private WebView web;
    private TextView noteView;
    private View fullView;
    private WebChromeClient.CustomViewCallback fullCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private String itemId;
    private String videoId;
    private boolean ownPage;   // YouTube's own page is showing, so nothing is known about how far you got
    private boolean ready;
    private boolean ended;
    private int state = -2;
    private int error;
    private double at;
    private double length;
    private long openedAt;
    private long shellAt;      // when the player's page had loaded: the wait for the player starts here
    private boolean gone;      // closing: the planner may already have collected what was left, so nothing more is written

    static boolean isVideoId(String v) {
        return v != null && v.matches("[A-Za-z0-9_-]{11}");
    }

    /** The address the player's page is loaded from: https:// and the app's id, which is how YouTube asks an app to name itself. */
    static String origin(Context c) {
        return "https://" + c.getPackageName().toLowerCase(Locale.ROOT);
    }

    /** The page the player sits on. The player fills the width, at the shape of a video, and nothing covers it. */
    static String shell(String videoId, int start, String origin) {
        return "<!doctype html><html><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<meta name=\"referrer\" content=\"strict-origin-when-cross-origin\">"
                + "<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}"
                + "#w{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center}"
                + "#b{width:100%;max-width:calc(100vh*16/9);aspect-ratio:16/9;min-height:200px}"
                + "#b iframe{width:100%;height:100%;border:0;display:block}</style></head>"
                + "<body><div id=\"w\"><div id=\"b\"><div id=\"p\"></div></div></div><script>"
                + "var S={ready:0,st:-2,t:0,d:0,err:0};window.__s=S;var player=null;"
                + "function onYouTubeIframeAPIReady(){try{player=new YT.Player('p',{width:'100%',height:'100%',videoId:'" + videoId + "',"
                + "playerVars:{playsinline:1,rel:0,autoplay:1,start:" + start + ",origin:'" + origin + "',widget_referrer:'" + origin + "'},"
                + "events:{onReady:function(){S.ready=1;try{S.d=player.getDuration()||0}catch(e){}},"
                + "onStateChange:function(e){S.st=e.data;try{S.d=player.getDuration()||S.d}catch(x){}},"
                + "onError:function(e){S.err=e.data||-2}}})}catch(e){S.err=-3}}"
                + "setInterval(function(){try{if(player&&player.getCurrentTime){var t=player.getCurrentTime();if(t>0)S.t=t;S.d=player.getDuration()||S.d}}catch(e){}},500);"
                + "var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=function(){S.err=-1};document.head.appendChild(s);"
                + "</script></body></html>";
    }

    /** YouTube's own page for the video, carrying on from where the player had got to. */
    static String watchUrl(String videoId, double seconds) {
        int s = (int) Math.floor(seconds);
        return "https://www.youtube.com/watch?v=" + videoId + (s > 5 ? "&t=" + s + "s" : "");
    }

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        itemId = getIntent().getStringExtra(EXTRA_ID);
        videoId = getIntent().getStringExtra(EXTRA_VIDEO);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        int start = Math.max(0, getIntent().getIntExtra(EXTRA_START, 0));
        if (itemId == null || !isVideoId(videoId)) {
            finish();
            return;
        }
        // Android may rebuild this screen after closing the app to save memory: carry on from where the video had got to.
        if (savedInstanceState != null) start = Math.max(start, savedInstanceState.getInt("at", 0));
        at = start;
        openedAt = System.currentTimeMillis();
        current = this;

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
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
        TextView titleView = new TextView(this);
        titleView.setTextColor(0xFFFFFFFF);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setText(title == null || title.isEmpty() ? "Video" : title);
        TextView hostView = new TextView(this);
        hostView.setTextColor(0xB3FFFFFF);
        hostView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        hostView.setSingleLine(true);
        hostView.setEllipsize(TextUtils.TruncateAt.END);
        hostView.setText("YouTube, inside Cap and Gown");
        names.addView(titleView);
        names.addView(hostView);
        bar.addView(names, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(button("Browser", v -> toBrowser()));
        page.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setSupportMultipleWindows(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        // You tapped Watch to get here, so the video may start without a second tap.
        ws.setMediaPlaybackRequiresUserGesture(false);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        page.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        noteView = new TextView(this);
        noteView.setBackgroundColor(BAR);
        noteView.setTextColor(0xB3FFFFFF);
        noteView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        noteView.setGravity(Gravity.CENTER);
        noteView.setPadding(dp(14), dp(10), dp(14), dp(10));
        noteView.setText("When the video ends you go back to the app, and its cards join your review cards.");
        page.addView(noteView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);

        String origin = origin(this);
        Log.i(TAG, "open " + videoId + " at " + start + "s as " + origin);
        String standIn = testPage;
        web.loadDataWithBaseURL(origin + "/", standIn != null ? standIn : shell(videoId, start, origin), "text/html", "utf-8", null);
        keep();
    }

    /* ---------- what the player says ---------- */

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (web == null || ownPage || ended) return;
            web.evaluateJavascript("(function(){try{return JSON.stringify(window.__s||null)}catch(e){return 'null'}})()", VideoActivity.this::heard);
            handler.postDelayed(this, 1000);
        }
    };

    private void heard(String value) {
        if (web == null || ownPage || ended || gone) return;
        try {
            Object v = value == null ? null : new JSONTokener(value).nextValue();
            JSONObject o = v instanceof String ? new JSONObject((String) v) : null;
            if (o != null) {
                boolean wasReady = ready;
                int was = state;
                ready = o.optInt("ready", 0) == 1;
                state = o.optInt("st", -2);
                error = o.optInt("err", 0);
                double t = o.optDouble("t", 0);
                double d = o.optDouble("d", 0);
                if (t > 0) at = t;
                if (d > 0) length = d;
                if (ready && !wasReady) Log.i(TAG, "ready, length " + Math.round(length) + "s");
                if (state != was) Log.i(TAG, "state " + state + " at " + Math.round(at) + "s of " + Math.round(length) + "s");
            }
        } catch (Exception ignored) { }
        if (state == 1) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (error != 0 && holdOnError) {
            keep();
            return;
        }
        if (error != 0) {
            ownPage("the player gave error " + error);
        } else if (!ready && (shellAt > 0 ? System.currentTimeMillis() - shellAt > READY_WAIT : System.currentTimeMillis() - openedAt > 2 * READY_WAIT)) {
            ownPage("the player did not answer in " + READY_WAIT / 1000 + " seconds");
        } else if (state == 0) {
            ended = true;
            if (length > 0) at = length;
            Log.i(TAG, "ended");
            keep();
            noteView.setText("Finished. Taking you back to the app.");
            handler.postDelayed(this::finish, 1200);
            return;
        }
        keep();
    }

    /** Shows YouTube's own page for the video, because the player could not play it. */
    private void ownPage(String why) {
        if (ownPage || web == null) return;
        ownPage = true;
        Log.i(TAG, "own page: " + why);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        noteView.setText("The app’s own player could not play this one, so this is YouTube’s page. Close when you have finished.");
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.loadUrl(watchUrl(videoId, at));
        keep();
    }

    /** Leaves what is known where the planner collects it. */
    private void keep() {
        if (gone || current != this) return;
        try {
            JSONObject o = new JSONObject();
            o.put("id", itemId);
            o.put("v", videoId);
            o.put("t", Math.round(at));
            o.put("d", Math.round(length));
            o.put("ended", ended);
            o.put("page", ownPage);
            o.put("ready", ready);
            o.put("state", state);
            o.put("error", error);
            o.put("ms", System.currentTimeMillis() - openedAt);
            String s = o.toString();
            last = s;
            synchronized (VideoActivity.class) {
                Alarms.prefs(this).edit().putString(KEY_RESULT, s).apply();
            }
        } catch (Exception ignored) { }
    }

    /** What the last video did, as JSON ({id, v, t, d, ended, page}), or "" if there is nothing new. Asking empties it. */
    static String take(Context c) {
        SharedPreferences p = Alarms.prefs(c);
        synchronized (VideoActivity.class) {
            String s = p.getString(KEY_RESULT, "");
            if (!s.isEmpty()) p.edit().remove(KEY_RESULT).apply();
            return s;
        }
    }

    /* ---------- the buttons ---------- */

    private void toBrowser() {
        pauseVideo();
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(watchUrl(videoId, ownPage ? 0 : at))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            Toast.makeText(this, "No app on this phone can open that link.", Toast.LENGTH_LONG).show();
        }
    }

    private void pauseVideo() {
        if (web != null && !ownPage) web.evaluateJavascript("try{player&&player.pauseVideo&&player.pauseVideo()}catch(e){}", null);
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

    /* ---------- the screen ---------- */

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, 1000);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(poll);
        // A video does not play on behind another screen.
        pauseVideo();
        if (web != null) web.onPause();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (web != null) keep();
        // The planner collects what was left as soon as it is back on screen, so a closing screen writes nothing after this.
        if (isFinishing()) gone = true;
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("at", (int) Math.floor(at));
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (fullView != null) hideFull();
        if (web != null) {
            if (page != null) page.removeView(web);
            web.destroy();
            web = null;
        }
        if (current == this) {
            current = null;
            last = "";
        }
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (fullView != null) {
            hideFull();
            return;
        }
        if (ownPage && web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        finish();
    }

    private void hideFull() {
        if (fullView == null) return;
        root.removeView(fullView);
        fullView = null;
        page.setVisibility(View.VISIBLE);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (fullCallback != null) {
            try {
                fullCallback.onCustomViewHidden();
            } catch (Exception ignored) { }
            fullCallback = null;
        }
    }

    private class Client extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            if (shellAt == 0) shellAt = System.currentTimeMillis();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (!request.isForMainFrame()) return !scheme.equals("https");
            // YouTube's own page moves about within YouTube. Anything else, and every link out of the player
            // (its title, "Watch on YouTube"), goes to the phone's browser or the YouTube app, when you tapped it.
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            boolean youtube = host.equals("youtube.com") || host.endsWith(".youtube.com") || host.equals("youtu.be")
                    || host.equals("google.com") || host.endsWith(".google.com"); // its cookie question sits on a Google address
            if (ownPage && scheme.equals("https") && youtube) return false;
            if (scheme.equals("intent")) {
                try {
                    Intent in = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                    String fallback = in.getStringExtra("browser_fallback_url");
                    if (ownPage && ReaderActivity.canOpen(fallback)) view.loadUrl(fallback);
                } catch (Exception ignored) { }
                return true;
            }
            if ((scheme.equals("https") || scheme.equals("http")) && request.hasGesture()) {
                pauseVideo();
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) { }
            }
            return true;
        }
    }

    private class Chrome extends WebChromeClient {
        /** What the player's page says goes to the log, for the checks. */
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            if (m != null && !ownPage) Log.i(TAG, "page: " + m.message());
            return true;
        }

        /** Full-screen video, turned on its side. */
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
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        }

        @Override
        public void onHideCustomView() {
            hideFull();
        }
    }
}
