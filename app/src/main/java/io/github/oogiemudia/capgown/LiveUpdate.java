package io.github.oogiemudia.capgown;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Live updates: the planner page can be newer than the copy built into the app.
 *
 * The page carries a number (meta name="capgown-page"). The app looks at the copy on GitHub's main branch,
 * and when that number is higher than the built-in one it keeps the newer page on the phone and shows it
 * instead. So a change to the page (the library, the Study tab, deadlines) reaches the phone without a new install.
 *
 * Safety: a new page must call AndroidApp.pageReady() once it has drawn. If it never does after two tries,
 * it is marked bad and the built-in page comes back. Settings also has "Go back to the built-in version".
 */
final class LiveUpdate {

    static final String SOURCE = "https://raw.githubusercontent.com/oogiemudia/cap-and-gown-android/main/app/src/main/assets/index.html";
    private static final String PREFS = "capgown-live";
    private static final String FILE = "live-index.html";
    private static final long EVERY_MS = 3L * 60 * 60 * 1000;
    private static final int MAX_BYTES = 4_000_000;
    private static final Pattern PAGE = Pattern.compile("<meta\\s+name=\"capgown-page\"\\s+content=\"(\\d{1,9})\"");
    private static final Pattern MIN_APP = Pattern.compile("<meta\\s+name=\"capgown-min-app\"\\s+content=\"(\\d{1,9})\"");

    private static int bundled = -1;
    private static boolean busy;

    interface Done {
        /** state: ready, none, off, busy or error. page: the page number now waiting, or 0. */
        void result(String state, int page);
    }

    private LiveUpdate() { }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static File file(Context c) {
        return new File(c.getApplicationContext().getFilesDir(), FILE);
    }

    private static int number(Pattern p, String head) {
        Matcher m = p.matcher(head);
        if (!m.find()) return 0;
        try {
            return Integer.parseInt(m.group(1));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String head(byte[] bytes, int len) {
        return new String(bytes, 0, Math.min(len, 4096), StandardCharsets.UTF_8);
    }

    /** The page number of the copy built into the app. */
    static synchronized int bundled(Context c) {
        if (bundled >= 0) return bundled;
        bundled = 0;
        try (InputStream in = c.getApplicationContext().getAssets().open("index.html")) {
            byte[] buf = new byte[4096];
            int n = 0;
            while (n < buf.length) {
                int r = in.read(buf, n, buf.length - n);
                if (r < 0) break;
                n += r;
            }
            bundled = number(PAGE, head(buf, n));
        } catch (Exception ignored) { }
        return bundled;
    }

    private static int appCode(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    /** The newer page to show, or null to show the built-in one. Counts a try until the page says it is ready. */
    static synchronized File current(Context c) {
        SharedPreferences p = prefs(c);
        int live = p.getInt("page", 0);
        File f = file(c);
        if (live <= bundled(c) || !f.isFile() || f.length() < 1000) return null;
        if (live == p.getInt("bad", 0)) return null;
        if (p.getInt("ok", 0) != live) {
            int tries = p.getInt("tries", 0);
            if (tries >= 2) {
                p.edit().putInt("bad", live).apply();
                return null;
            }
            p.edit().putInt("tries", tries + 1).apply();
        }
        return f;
    }

    /** The page number that would be shown now, without counting a try. */
    static synchronized int showing(Context c) {
        SharedPreferences p = prefs(c);
        int live = p.getInt("page", 0);
        boolean use = live > bundled(c) && file(c).isFile() && live != p.getInt("bad", 0);
        return use ? live : bundled(c);
    }

    /** The page calls this once it has drawn, so the app knows the new page works. */
    static synchronized void confirm(Context c, int page) {
        SharedPreferences p = prefs(c);
        if (page > 0 && page == p.getInt("page", 0)) p.edit().putInt("ok", page).putInt("tries", 0).apply();
    }

    static void setAuto(Context c, boolean on) {
        prefs(c).edit().putBoolean("auto", on).apply();
    }

    /** Drops the downloaded page and does not fetch that one again. */
    static synchronized void revert(Context c) {
        SharedPreferences p = prefs(c);
        int live = p.getInt("page", 0);
        File f = file(c);
        if (f.exists() && !f.delete()) f.deleteOnExit();
        p.edit().putInt("bad", live).putInt("page", 0).putInt("ok", 0).putInt("tries", 0).remove("etag").apply();
    }

    static String status(Context c) {
        SharedPreferences p = prefs(c);
        JSONObject o = new JSONObject();
        try {
            int live = p.getInt("page", 0);
            o.put("bundled", bundled(c));
            o.put("page", showing(c));
            o.put("waiting", live > bundled(c) && live != p.getInt("bad", 0) && file(c).isFile() ? live : 0);
            o.put("bad", p.getInt("bad", 0));
            o.put("auto", p.getBoolean("auto", true));
            o.put("checked", p.getLong("checked", 0));
            o.put("lastError", p.getString("error", ""));
        } catch (JSONException ignored) { }
        return o.toString();
    }

    /** Looks for a newer page. Quiet checks run at most every few hours; force runs now. */
    static void check(Context context, boolean force, Done done) {
        final Context c = context.getApplicationContext();
        final Handler main = new Handler(Looper.getMainLooper());
        SharedPreferences p = prefs(c);
        if (!force) {
            if (!p.getBoolean("auto", true)) {
                if (done != null) done.result("off", 0);
                return;
            }
            long last = p.getLong("checked", 0);
            long now = System.currentTimeMillis();
            if (last > 0 && now >= last && now - last < EVERY_MS) {
                if (done != null) done.result("none", 0);
                return;
            }
        }
        synchronized (LiveUpdate.class) {
            if (busy) {
                if (done != null) done.result("busy", 0);
                return;
            }
            busy = true;
        }
        new Thread(() -> {
            String state = "error";
            int page = 0;
            try {
                int got = fetch(c);
                state = got > 0 ? "ready" : "none";
                page = got;
                prefs(c).edit().putLong("checked", System.currentTimeMillis()).putString("error", "").apply();
            } catch (Exception e) {
                String why = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                prefs(c).edit().putString("error", why.length() > 120 ? why.substring(0, 120) : why).apply();
            } finally {
                synchronized (LiveUpdate.class) {
                    busy = false;
                }
            }
            final String s = state;
            final int n = page;
            if (done != null) main.post(() -> done.result(s, n));
        }, "capgown-live").start();
    }

    /** Returns the new page number when a newer page was saved, or 0 when there is nothing newer. */
    private static int fetch(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        HttpURLConnection con = (HttpURLConnection) new URL(SOURCE).openConnection();
        try {
            con.setConnectTimeout(15000);
            con.setReadTimeout(20000);
            con.setInstanceFollowRedirects(false);
            con.setRequestProperty("Accept", "text/html,text/plain,*/*");
            String etag = p.getString("etag", "");
            if (!etag.isEmpty()) con.setRequestProperty("If-None-Match", etag);
            int code = con.getResponseCode();
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) return 0;
            if (code != HttpURLConnection.HTTP_OK) throw new Exception("The update server answered " + code);
            ByteArrayOutputStream out = new ByteArrayOutputStream(400_000);
            try (InputStream in = con.getInputStream()) {
                byte[] buf = new byte[16384];
                int r;
                while ((r = in.read(buf)) >= 0) {
                    out.write(buf, 0, r);
                    if (out.size() > MAX_BYTES) throw new Exception("The update is too big");
                }
            }
            byte[] bytes = out.toByteArray();
            long declared = con.getContentLengthLong();
            String encoding = con.getContentEncoding();
            if (declared > 0 && (encoding == null || encoding.isEmpty() || "identity".equals(encoding)) && declared != bytes.length) {
                throw new Exception("The update did not download fully");
            }
            String head = head(bytes, bytes.length);
            String tail = new String(bytes, Math.max(0, bytes.length - 200), Math.min(200, bytes.length), StandardCharsets.UTF_8);
            int page = number(PAGE, head);
            if (bytes.length < 20_000 || !head.toLowerCase().contains("<!doctype html") || !tail.contains("</html>") || page <= 0) {
                throw new Exception("The update did not look like the app's page");
            }
            String newTag = con.getHeaderField("ETag");
            SharedPreferences.Editor ed = p.edit();
            if (newTag != null && !newTag.isEmpty()) ed.putString("etag", newTag);
            else ed.remove("etag");
            synchronized (LiveUpdate.class) {
                int have = Math.max(bundled(c), p.getInt("page", 0));
                boolean newer = page > have && page != p.getInt("bad", 0);
                boolean fits = number(MIN_APP, head) <= appCode(c);
                if (!newer || !fits) {
                    ed.apply();
                    return 0;
                }
                File tmp = new File(c.getFilesDir(), FILE + ".tmp");
                try (FileOutputStream fo = new FileOutputStream(tmp)) {
                    fo.write(bytes);
                    fo.getFD().sync();
                }
                File dest = file(c);
                if (dest.exists() && !dest.delete()) throw new Exception("Could not replace the saved page");
                if (!tmp.renameTo(dest)) throw new Exception("Could not save the update");
                ed.putInt("page", page).putInt("tries", 0).putInt("ok", 0).apply();
                return page;
            }
        } finally {
            con.disconnect();
        }
    }
}
