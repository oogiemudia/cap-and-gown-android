package io.github.oogiemudia.capgown;

import android.content.Context;
import android.net.ConnectivityManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import ai.moonshine.voice.JNI;
import ai.moonshine.voice.TranscriberOption;

/**
 * The speech model behind the app's own listening (OwnSpeech), which turns sound into words on the phone
 * itself, so that a mentor meeting can be listened to with the phone locked and nothing leaves the phone.
 *
 * The engine (Moonshine Voice, MIT licence) is in the app. Its model is not: it is a one-off download of
 * between 43 and 257 MB, in one of three sizes, kept in the app's own folder. The list of files and
 * where they come from is the engine's own list, so nothing here names a file.
 */
final class SpeechModel {

    /** Told whenever the download moves on, finishes or fails. May be called on any thread. */
    interface Watcher {
        void onChange();
    }

    /** The sizes on offer, the recommended one first. */
    static final String[] KEYS = {"small", "medium", "tiny"};

    private static final String PREFS = "speech";
    private static final String KEY_USE = "use";
    private static final String DONE_FILE = "complete";
    private static final long SPARE_BYTES = 32L * 1024 * 1024; // room left on the phone after a file is written

    private static final class Item {
        String name;
        String url;
        long size = -1;
        String sum = "";
        String sumType = "";
    }

    private static final Map<String, List<Item>> lists = new HashMap<>();
    private static Boolean supported;
    private static volatile boolean broken; // the engine would not start with the model: use the phone's speech

    private static volatile String busy = ""; // the size being downloaded
    private static volatile long done;
    private static volatile long total;
    private static volatile String error = ""; // offline, space or failed
    private static volatile boolean cancel;
    private static volatile Watcher watcher;

    private SpeechModel() { }

    /** Whether this phone can run the engine at all (its processor has a build of it in the app). */
    static synchronized boolean supported() {
        if (supported == null) {
            try {
                JNI.ensureLibraryLoaded();
                supported = true;
            } catch (Throwable e) {
                supported = false;
            }
        }
        return supported;
    }

    static boolean known(String key) {
        for (String k : KEYS) if (k.equals(key)) return true;
        return false;
    }

    static int arch(String key) {
        if ("tiny".equals(key)) return JNI.MOONSHINE_MODEL_ARCH_TINY_STREAMING;
        if ("small".equals(key)) return JNI.MOONSHINE_MODEL_ARCH_SMALL_STREAMING;
        if ("medium".equals(key)) return JNI.MOONSHINE_MODEL_ARCH_MEDIUM_STREAMING;
        return -1;
    }

    static File dir(Context c, String key) {
        return new File(new File(c.getNoBackupFilesDir(), "speech"), key);
    }

    static void watch(Watcher w) {
        watcher = w;
    }

    static boolean busy() {
        return !busy.isEmpty();
    }

    /** The engine would not start with the model it was given: until the app starts again, leave it alone. */
    static void broken(boolean b) {
        broken = b;
    }

    /** The files of one size, as the engine lists them: {"groups":[{"base_url":..,"files":[..]}]}. */
    private static synchronized List<Item> files(String key) throws IOException {
        List<Item> got = lists.get(key);
        if (got != null) return got;
        if (!supported() || arch(key) < 0) throw new IOException("no engine");
        List<Item> list = new ArrayList<>();
        try {
            String json = JNI.moonshineGetSttDependencies("en",
                    new TranscriberOption[]{new TranscriberOption("model_arch", String.valueOf(arch(key)))});
            JSONArray groups = new JSONObject(json).getJSONArray("groups");
            for (int g = 0; g < groups.length(); g++) {
                JSONObject group = groups.getJSONObject(g);
                String base = group.optString("base_url", "");
                JSONArray files = group.getJSONArray("files");
                for (int f = 0; f < files.length(); f++) {
                    Item it = new Item();
                    JSONObject o = files.optJSONObject(f);
                    if (o != null) {
                        it.name = o.getString("name");
                        it.url = o.optString("url", "");
                        it.size = o.optLong("size", -1);
                        it.sum = o.optString("checksum", "");
                        it.sumType = o.optString("checksum_type", "");
                    } else {
                        it.name = files.getString(f); // an older shape of the list: names only
                    }
                    if (it.url.isEmpty()) it.url = base + "/" + it.name;
                    // A name stays inside the model's folder, and a file only ever comes over https.
                    if (it.name.isEmpty() || it.name.startsWith("/") || it.name.contains("..") || it.name.contains("\\")
                            || !it.url.startsWith("https://")) {
                        throw new IOException("odd file in the list");
                    }
                    list.add(it);
                }
            }
        } catch (IOException e) {
            throw e;
        } catch (Throwable e) {
            throw new IOException("no list", e);
        }
        if (list.isEmpty()) throw new IOException("empty list");
        lists.put(key, list);
        return list;
    }

    /** The size of the download in bytes, or -1 where the engine's list does not say. */
    static long bytes(String key) {
        try {
            long sum = 0;
            for (Item it : files(key)) {
                if (it.size < 0) return -1;
                sum += it.size;
            }
            return sum;
        } catch (IOException e) {
            return -1;
        }
    }

    /** Every file of this size is on the phone, whole. */
    static boolean ready(Context c, String key) {
        if (!known(key) || !supported()) return false;
        File d = dir(c, key);
        if (!new File(d, DONE_FILE).exists()) return false;
        try {
            for (Item it : files(key)) {
                File f = new File(d, it.name);
                if (!f.exists() || (it.size >= 0 && f.length() != it.size)) return false;
            }
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** The size the meeting listener will use, or "" for the phone's own speech service. */
    static String inUse(Context c) {
        if (broken) return "";
        String key = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_USE, "");
        return key != null && ready(c, key) ? key : "";
    }

    /** Chooses the size to listen with. "" goes back to the phone's own speech service. */
    static void use(Context c, String key) {
        if (!key.isEmpty() && !ready(c, key)) return;
        broken = false;
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_USE, key).apply();
        changed();
    }

    static void cancel() {
        cancel = true;
    }

    /** Removes a download. Not while it is the one being fetched. */
    static void delete(Context c, String key) {
        if (!known(key) || key.equals(busy)) return;
        wipe(dir(c, key));
        changed();
    }

    private static void wipe(File f) {
        File[] all = f.listFiles();
        if (all != null) for (File x : all) wipe(x);
        f.delete();
    }

    /** What the page shows: which sizes are on the phone, which is in use, and how a download is going. */
    static JSONObject status(Context c) {
        JSONObject o = new JSONObject();
        try {
            boolean can = supported();
            o.put("supported", can);
            JSONObject sizes = new JSONObject();
            for (String k : KEYS) {
                JSONObject s = new JSONObject();
                s.put("bytes", can ? bytes(k) : -1);
                s.put("ready", can && ready(c, k));
                sizes.put(k, s);
            }
            o.put("sizes", sizes);
            o.put("use", can ? inUse(c) : "");
            o.put("broken", broken);
            o.put("busy", busy);
            o.put("done", done);
            o.put("total", total);
            o.put("error", error);
            boolean metered = false;
            try {
                ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
                metered = cm != null && cm.isActiveNetworkMetered();
            } catch (Exception ignored) { }
            o.put("metered", metered);
        } catch (JSONException ignored) { }
        return o;
    }

    /** Fetches one size in the background. One download at a time; a second call is ignored. */
    static synchronized void download(Context context, String key) {
        if (!busy.isEmpty() || !known(key) || !supported()) return;
        final Context c = context.getApplicationContext();
        busy = key;
        done = 0;
        total = Math.max(0, bytes(key));
        error = "";
        cancel = false;
        Thread t = new Thread(() -> {
            String problem = "";
            try {
                fetch(c, key);
            } catch (Stopped e) {
                problem = "";
            } catch (NoRoom e) {
                problem = "space";
            } catch (java.net.UnknownHostException | java.net.SocketTimeoutException
                     | javax.net.ssl.SSLException | java.net.SocketException e) {
                problem = "offline";
            } catch (Throwable e) {
                problem = "failed";
            }
            error = problem;
            busy = "";
            if (problem.isEmpty() && ready(c, key)) use(c, key); // the size just fetched is the one to listen with
            else changed();
        }, "speech-download");
        t.setDaemon(true);
        t.start();
        changed();
    }

    private static final class Stopped extends IOException { }

    private static final class NoRoom extends IOException { }

    private static void changed() {
        Watcher w = watcher;
        if (w != null) w.onChange();
    }

    private static void fetch(Context c, String key) throws IOException {
        List<Item> list = files(key);
        File d = dir(c, key);
        if (!d.isDirectory() && !d.mkdirs()) throw new IOException("no folder");
        new File(d, DONE_FILE).delete();
        long before = 0; // bytes of the files already whole
        for (Item it : list) {
            if (cancel) throw new Stopped();
            File dst = new File(d, it.name);
            File parent = dst.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("no folder");
            if (dst.exists() && (it.size < 0 || dst.length() == it.size)) {
                before += dst.length();
                done = before;
                continue;
            }
            one(it, dst, before);
            before += dst.length();
            done = before;
            changed();
        }
        try (FileOutputStream out = new FileOutputStream(new File(d, DONE_FILE))) {
            out.write(String.valueOf(System.currentTimeMillis()).getBytes("UTF-8"));
        }
    }

    /** One file: carried on from where it stopped last time, checked, then moved into place. */
    private static void one(Item it, File dst, long before) throws IOException {
        File part = new File(dst.getPath() + ".part");
        long have = part.exists() ? part.length() : 0;
        if (it.size >= 0 && have > it.size) {
            part.delete();
            have = 0;
        }
        if (it.size < 0 || have < it.size) {
            HttpURLConnection con = open(it.url, have);
            int code = con.getResponseCode();
            if (code == 416 && have > 0) { // the part on the phone is not a part of this file: start it again
                con.disconnect();
                part.delete();
                have = 0;
                con = open(it.url, 0);
                code = con.getResponseCode();
            }
            try {
                if (code != 200 && code != 206) throw new IOException("HTTP " + code);
                if (code == 200 && have > 0) { // the server sent the whole file again
                    part.delete();
                    have = 0;
                }
                long len = con.getContentLengthLong();
                if (it.size < 0 && len >= 0) total += have + len;
                long room = dst.getParentFile() == null ? 0 : dst.getParentFile().getUsableSpace();
                if (len > 0 && room > 0 && room < len + SPARE_BYTES) throw new NoRoom();
                try (InputStream in = con.getInputStream(); RandomAccessFile out = new RandomAccessFile(part, "rw")) {
                    out.seek(have);
                    byte[] buf = new byte[64 * 1024];
                    long told = 0;
                    int n;
                    while ((n = in.read(buf)) >= 0) {
                        if (cancel) throw new Stopped();
                        out.write(buf, 0, n);
                        have += n;
                        done = before + have;
                        long now = System.currentTimeMillis();
                        if (now - told >= 500) {
                            told = now;
                            changed();
                        }
                    }
                }
            } finally {
                con.disconnect();
            }
        }
        if (it.size >= 0 && part.length() != it.size) {
            part.delete();
            throw new IOException("wrong size");
        }
        if (!sumOk(it, part)) {
            part.delete();
            throw new IOException("wrong checksum");
        }
        if (dst.exists() && !dst.delete()) throw new IOException("in the way");
        if (!part.renameTo(dst)) {
            part.delete();
            throw new IOException("could not move");
        }
    }

    private static HttpURLConnection open(String url, long from) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(30000);
        con.setReadTimeout(60000);
        con.setInstanceFollowRedirects(true);
        con.setRequestProperty("Accept-Encoding", "identity"); // the sizes are of the files as they are
        if (from > 0) con.setRequestProperty("Range", "bytes=" + from + "-");
        return con;
    }

    /**
     * Checks a file against the engine's list, where the list gives a checksum this phone can work out and
     * recognise (the list gives CRC-32C). A checksum written in a way it does not recognise is not held
     * against the file.
     */
    private static boolean sumOk(Item it, File f) throws IOException {
        String want = it.sum.trim();
        if (want.isEmpty()) return true;
        String kind = it.sumType.toLowerCase(Locale.ROOT).replace("-", "").replace("_", "");
        byte[] sum;
        if (kind.equals("crc32c")) {
            sum = crc32c(f);
        } else {
            String algo = kind.equals("sha256") ? "SHA-256" : kind.equals("sha1") ? "SHA-1" : kind.equals("md5") ? "MD5" : "";
            if (algo.isEmpty()) return true;
            try (FileInputStream in = new FileInputStream(f)) {
                MessageDigest md = MessageDigest.getInstance(algo);
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) >= 0) {
                    if (cancel) throw new Stopped();
                    md.update(buf, 0, n);
                }
                sum = md.digest();
            } catch (java.security.NoSuchAlgorithmException e) {
                return true;
            }
        }
        if (same(want, sum)) return true;
        if (sum.length == 4 && same(want, new byte[]{sum[3], sum[2], sum[1], sum[0]})) return true; // written low byte first
        // Wrong only if it is plainly the same kind of checksum, written the same way, with a different value.
        String hex = hex(sum);
        String b64 = android.util.Base64.encodeToString(sum, android.util.Base64.NO_WRAP);
        boolean asHex = want.length() == hex.length() && want.matches("[0-9a-fA-F]+");
        boolean asB64 = (want.length() == b64.length() || want.length() == b64.replace("=", "").length()) && want.matches("[A-Za-z0-9+/]+=*");
        return !(asHex || asB64);
    }

    private static boolean same(String want, byte[] sum) {
        if (want.equalsIgnoreCase(hex(sum))) return true;
        String b64 = android.util.Base64.encodeToString(sum, android.util.Base64.NO_WRAP);
        return want.equals(b64) || want.equals(b64.replace("=", ""));
    }

    private static String hex(byte[] sum) {
        StringBuilder hex = new StringBuilder();
        for (byte b : sum) hex.append(String.format(Locale.ROOT, "%02x", b));
        return hex.toString();
    }

    private static int[] crcTable;

    /** The CRC-32C (Castagnoli) of a file, as four bytes, high byte first. */
    static byte[] crc32c(File f) throws IOException {
        int[] t = crcTable;
        if (t == null) {
            t = new int[256];
            for (int i = 0; i < 256; i++) {
                int c = i;
                for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? (c >>> 1) ^ 0x82F63B78 : c >>> 1;
                t[i] = c;
            }
            crcTable = t;
        }
        int crc = 0xFFFFFFFF;
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) >= 0) {
                if (cancel) throw new Stopped();
                for (int i = 0; i < n; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
            }
        }
        crc = ~crc;
        return new byte[]{(byte) (crc >>> 24), (byte) (crc >>> 16), (byte) (crc >>> 8), (byte) crc};
    }
}
