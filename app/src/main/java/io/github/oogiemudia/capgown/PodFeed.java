package io.github.oogiemudia.capgown;

import org.xml.sax.Attributes;
import org.xml.sax.helpers.DefaultHandler;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;

/**
 * Finds a podcast's episodes: fetches its RSS feed and reads out each episode's title, audio file, page,
 * date and length. The page cannot do this itself (the feed sites do not allow a page from elsewhere to
 * read them), so the app does it and hands back JSON.
 *
 * Where a show only gives an Apple Podcasts or Spotify link, Apple's free lookup service gives the feed's
 * address. Every feed that works is kept on the phone, so the list still shows without a connection.
 *
 * Plain Java only (no Android classes), so it can be tested on a computer. Call load() off the main thread.
 */
final class PodFeed {

    static final String UA = "CapAndGown/1.0 (Android; podcast player; +https://github.com/oogiemudia/cap-and-gown-android)";
    private static final int MAX_FEED = 20 * 1024 * 1024;
    private static final int MAX_EPISODES = 400;
    private static final int NOTE = 320;

    private PodFeed() { }

    static final class Episode {
        String title = "";
        String audio = "";
        String type = "";
        String link = "";
        String guid = "";
        String image = "";
        String note = "";
        String date = "";
        String duration = "";
    }

    static final class Feed {
        String title = "";
        String image = "";
        String url = "";
        final List<Episode> episodes = new ArrayList<>();
    }

    /**
     * The episodes as JSON: {ok, title, image, feed, at, stale, error, eps: [{t, u, l, g, i, n, d, s}]}.
     * feeds are tried in order, then Apple's lookup of apple (an Apple Podcasts id), then a search for term.
     */
    static String load(File cacheDir, List<String> feeds, String apple, String term) {
        String key = cacheKey(feeds, apple, term);
        File cache = cacheDir == null ? null : new File(new File(cacheDir, "podfeeds"), key + ".json");
        String cached = readText(cache);
        List<String> tries = new ArrayList<>();
        // the address that worked last time goes first
        String known = cached == null ? "" : field(cached, "feed");
        if (!known.isEmpty()) tries.add(known);
        for (String f : feeds) if (f != null && !f.trim().isEmpty() && !tries.contains(f.trim())) tries.add(f.trim());
        String lastError = "";
        for (String f : tries) {
            try {
                return keep(cache, toJson(fetch(f), false, ""));
            } catch (Exception e) {
                lastError = String.valueOf(e.getMessage());
            }
        }
        // Apple's directory knows the feed address of almost every show.
        List<String> more = new ArrayList<>();
        try {
            if (apple != null && apple.matches("\\d{4,12}")) {
                String js = text(get("https://itunes.apple.com/lookup?entity=podcast&id=" + apple, 400_000));
                more.addAll(feedUrls(js, ""));
            }
            if (more.isEmpty() && term != null && term.trim().length() >= 3) {
                String js = text(get("https://itunes.apple.com/search?media=podcast&entity=podcast&limit=8&country=GB&term="
                        + URLEncoder.encode(term.trim(), "UTF-8"), 600_000));
                more.addAll(feedUrls(js, term));
            }
        } catch (Exception e) {
            lastError = String.valueOf(e.getMessage());
        }
        for (String f : more) {
            if (tries.contains(f)) continue;
            try {
                return keep(cache, toJson(fetch(f), false, ""));
            } catch (Exception e) {
                lastError = String.valueOf(e.getMessage());
            }
        }
        if (cached != null && cached.startsWith("{\"ok\":true,\"stale\":false,")) {
            // offline, or the show's site is down: the list from last time, marked as old
            return cached.replaceFirst("\"stale\":false", "\"stale\":true");
        }
        return "{\"ok\":false,\"error\":" + quote(lastError.isEmpty() ? "no feed" : lastError) + "}";
    }

    /** Fetches and reads one feed. */
    static Feed fetch(String url) throws Exception {
        byte[] data = get(url, MAX_FEED);
        Feed f = parse(data);
        if (f.episodes.isEmpty()) throw new IOException("no episodes in " + url);
        f.url = url;
        return f;
    }

    /* ---------- reading the feed ---------- */

    static Feed parse(byte[] data) throws Exception {
        int start = 0;
        while (start < data.length && (data[start] == ' ' || data[start] == '\n' || data[start] == '\r' || data[start] == '\t')) start++;
        SAXParserFactory pf = SAXParserFactory.newInstance();
        pf.setNamespaceAware(false);
        pf.setValidating(false);
        for (String feature : new String[]{
                "http://xml.org/sax/features/external-general-entities",
                "http://xml.org/sax/features/external-parameter-entities",
                "http://apache.org/xml/features/nonvalidating/load-external-dtd"}) {
            try {
                pf.setFeature(feature, false);
            } catch (Exception ignored) { }
        }
        SAXParser p = pf.newSAXParser();
        Reader r = new Reader();
        try {
            p.parse(new ByteArrayInputStream(data, start, data.length - start), r);
        } catch (Exception e) {
            // Stopped on purpose once there were enough episodes (some parsers wrap the reason), or the feed is
            // broken further down: the episodes read before that point are still good.
            if (r.feed.episodes.isEmpty()) throw e;
        }
        return r.feed;
    }

    private static final class Enough extends RuntimeException {
        private static final long serialVersionUID = 1L;

        Enough() {
            super("enough", null, false, false);
        }
    }

    private static final class Reader extends DefaultHandler {
        final Feed feed = new Feed();
        private Episode cur;
        private final StringBuilder text = new StringBuilder();
        private int imageDepth;   // inside the channel's <image>
        private int depth;

        private static String name(String local, String q) {
            String n = q != null && !q.isEmpty() ? q : local;
            return n == null ? "" : n.toLowerCase(Locale.ROOT);
        }

        @Override
        public void startElement(String uri, String local, String q, Attributes a) {
            depth++;
            String n = name(local, q);
            text.setLength(0);
            switch (n) {
                case "item":
                case "entry":
                    cur = new Episode();
                    break;
                case "enclosure": {
                    if (cur == null) break;
                    String u = attr(a, "url");
                    String type = attr(a, "type").toLowerCase(Locale.ROOT);
                    boolean audio = type.startsWith("audio") || u.toLowerCase(Locale.ROOT).matches("(?s).*\\.(mp3|m4a|aac|ogg|opus|wav)([?#].*)?");
                    if (!u.isEmpty() && (cur.audio.isEmpty() || (audio && !cur.type.startsWith("audio")))) {
                        cur.audio = u;
                        cur.type = audio && type.isEmpty() ? "audio" : type;
                    }
                    break;
                }
                case "media:content": {
                    if (cur == null || !cur.audio.isEmpty()) break;
                    String type = attr(a, "type").toLowerCase(Locale.ROOT);
                    if (type.startsWith("audio")) {
                        cur.audio = attr(a, "url");
                        cur.type = type;
                    }
                    break;
                }
                case "itunes:image": {
                    String h = attr(a, "href");
                    if (h.isEmpty()) break;
                    if (cur != null) cur.image = h;
                    else if (feed.image.isEmpty()) feed.image = h;
                    break;
                }
                case "image":
                    if (cur == null) imageDepth = depth;
                    break;
                default:
                    break;
            }
        }

        @Override
        public void characters(char[] ch, int start, int length) {
            if (text.length() < 60_000) text.append(ch, start, Math.min(length, 60_000 - text.length()));
        }

        @Override
        public void endElement(String uri, String local, String q) {
            String n = name(local, q);
            String v = text.toString().trim();
            text.setLength(0);
            if (cur != null) {
                switch (n) {
                    case "title":
                        if (cur.title.isEmpty()) cur.title = v;
                        break;
                    case "itunes:title":
                        if (cur.title.isEmpty()) cur.title = v;
                        break;
                    case "link":
                        if (cur.link.isEmpty()) cur.link = v;
                        break;
                    case "guid":
                        cur.guid = v;
                        break;
                    case "pubdate":
                    case "published":
                        if (cur.date.isEmpty()) cur.date = v;
                        break;
                    case "itunes:duration":
                        cur.duration = v;
                        break;
                    case "description":
                    case "itunes:summary":
                    case "content:encoded":
                    case "itunes:subtitle":
                        if (cur.note.isEmpty()) cur.note = plain(v, NOTE);
                        break;
                    case "item":
                    case "entry":
                        if (!cur.audio.isEmpty() && cur.audio.matches("(?i)https?://.+")) feed.episodes.add(cur);
                        cur = null;
                        if (feed.episodes.size() >= MAX_EPISODES) throw new Enough();
                        break;
                    default:
                        break;
                }
            } else if (imageDepth > 0) {
                if ("url".equals(n) && feed.image.isEmpty()) feed.image = v;
                if ("image".equals(n) && depth == imageDepth) imageDepth = 0;
            } else if ("title".equals(n) && feed.title.isEmpty()) {
                feed.title = v;
            }
            depth--;
        }

        private static String attr(Attributes a, String name) {
            String v = a.getValue(name);
            if (v == null) {
                for (int i = 0; i < a.getLength(); i++) {
                    if (name.equalsIgnoreCase(a.getQName(i)) || name.equalsIgnoreCase(a.getLocalName(i))) {
                        v = a.getValue(i);
                        break;
                    }
                }
            }
            return v == null ? "" : v.trim();
        }
    }

    /* ---------- the JSON handed to the page ---------- */

    static String toJson(Feed f, boolean stale, String error) {
        StringBuilder b = new StringBuilder(f.episodes.size() * 400 + 200);
        b.append("{\"ok\":true,\"stale\":").append(stale)
                .append(",\"at\":").append(System.currentTimeMillis())
                .append(",\"feed\":").append(quote(f.url))
                .append(",\"title\":").append(quote(f.title))
                .append(",\"image\":").append(quote(f.image))
                .append(",\"error\":").append(quote(error))
                .append(",\"eps\":[");
        boolean first = true;
        for (Episode e : f.episodes) {
            if (!first) b.append(',');
            first = false;
            b.append("{\"t\":").append(quote(e.title))
                    .append(",\"u\":").append(quote(e.audio))
                    .append(",\"l\":").append(quote(e.link))
                    .append(",\"g\":").append(quote(e.guid.length() > 300 ? e.guid.substring(0, 300) : e.guid))
                    .append(",\"i\":").append(quote(e.image))
                    .append(",\"n\":").append(quote(e.note))
                    .append(",\"d\":").append(date(e.date))
                    .append(",\"s\":").append(seconds(e.duration))
                    .append('}');
        }
        return b.append("]}").toString();
    }

    /** A JSON string, safe to hand to the page's script as it is. */
    static String quote(String s) {
        if (s == null) s = "";
        StringBuilder b = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '<': b.append("\\u003c"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029 || (c >= 0xD800 && c <= 0xDFFF && !pairOk(s, i))) {
                        b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    } else {
                        b.append(c);
                    }
            }
        }
        return b.append('"').toString();
    }

    private static boolean pairOk(String s, int i) {
        char c = s.charAt(i);
        if (Character.isHighSurrogate(c)) return i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1));
        return i > 0 && Character.isHighSurrogate(s.charAt(i - 1));
    }

    /** The length in seconds: "1:02:03", "62:03" or "3723". 0 when not given. */
    static long seconds(String d) {
        if (d == null) return 0;
        String t = d.trim();
        if (t.isEmpty()) return 0;
        try {
            if (t.contains(":")) {
                long s = 0;
                for (String p : t.split(":")) s = s * 60 + (long) Double.parseDouble(p.trim().isEmpty() ? "0" : p.trim());
                return Math.max(0, s);
            }
            return Math.max(0, (long) Double.parseDouble(t));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static final String[] DATES = {
            "EEE, d MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm:ss zzz", "EEE, d MMM yyyy HH:mm Z", "d MMM yyyy HH:mm:ss Z",
            "EEE, d MMM yyyy HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd"
    };

    /** The date in milliseconds since 1970, or 0. */
    static long date(String d) {
        if (d == null || d.trim().isEmpty()) return 0;
        String t = d.trim().replaceAll("\\s+", " ");
        for (String pat : DATES) {
            try {
                SimpleDateFormat f = new SimpleDateFormat(pat, Locale.ENGLISH);
                f.setTimeZone(TimeZone.getTimeZone("UTC"));
                f.setLenient(true);
                ParsePosition pos = new ParsePosition(0);
                Date x = f.parse(t, pos);
                if (x != null && pos.getIndex() > 0) return x.getTime();
            } catch (Exception ignored) { }
        }
        return 0;
    }

    private static final Pattern TAG = Pattern.compile("<[^>]*>");
    private static final Pattern NUM = Pattern.compile("&#(x?)([0-9a-fA-F]{1,6});");

    /** Show notes as plain text: no tags, entities read, cut at about max letters on a word. */
    static String plain(String html, int max) {
        String t = TAG.matcher(html.replaceAll("(?i)<br\\s*/?>|</p>", " ")).replaceAll(" ");
        Matcher m = NUM.matcher(t);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String rep;
            try {
                int cp = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16);
                rep = Character.isValidCodePoint(cp) ? new String(Character.toChars(cp)) : " ";
            } catch (NumberFormatException e) {
                rep = " ";
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(rep));
        }
        m.appendTail(sb);
        t = sb.toString().replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&apos;", "'").replace("&rsquo;", "’").replace("&lsquo;", "‘")
                .replace("&ldquo;", "“").replace("&rdquo;", "”").replace("&ndash;", "-").replace("&mdash;", ", ")
                .replace("&hellip;", "…").replaceAll("\\s+", " ").trim();
        if (t.length() <= max) return t;
        int cut = t.lastIndexOf(' ', max);
        return t.substring(0, cut > max / 2 ? cut : max).trim() + "…";
    }

    /* ---------- Apple's directory ---------- */

    private static final Pattern RESULT = Pattern.compile("\"collectionName\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"|\"feedUrl\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");

    /** Feed addresses from Apple's answer, best match for term first. With no term, all of them in order. */
    static List<String> feedUrls(String json, String term) {
        List<String> exact = new ArrayList<>();
        List<String> good = new ArrayList<>();
        List<String> rest = new ArrayList<>();
        if (json == null) return good;
        List<String> want = term == null ? new ArrayList<>() : words(term);
        // Each result is its own object; split on the start of one so names and feeds stay paired.
        for (String part : json.split("\\{\"wrapperType\"")) {
            String name = "";
            String feed = "";
            Matcher m = RESULT.matcher(part);
            while (m.find()) {
                if (m.group(1) != null && name.isEmpty()) name = unescape(m.group(1));
                if (m.group(2) != null && feed.isEmpty()) feed = unescape(m.group(2));
            }
            if (!feed.matches("(?i)https?://.+")) continue;
            List<String> have = words(name);
            if (want.isEmpty()) rest.add(feed);
            else if (have.equals(want)) exact.add(feed);
            else if (have.containsAll(want)) good.add(feed);
        }
        exact.addAll(good);
        exact.addAll(rest);
        return exact;
    }

    private static List<String> words(String s) {
        List<String> out = new ArrayList<>();
        for (String w : s.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (w.length() > 2 && !w.equals("the") && !w.equals("and") && !w.equals("podcast")) out.add(w);
        }
        return out;
    }

    private static String unescape(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                if (n == 'u' && i + 4 < s.length()) {
                    try {
                        b.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
                        i += 4;
                        continue;
                    } catch (NumberFormatException ignored) { }
                }
                b.append(n == 'n' ? '\n' : n == 't' ? '\t' : n);
            } else {
                b.append(c);
            }
        }
        return b.toString();
    }

    /* ---------- the network and the phone's cache ---------- */

    /** GET with redirects followed (http becomes https, as Android allows only https). */
    static byte[] get(String url, int max) throws IOException {
        String u = url.trim();
        for (int hop = 0; hop < 7; hop++) {
            if (u.regionMatches(true, 0, "http://", 0, 7)) u = "https://" + u.substring(7);
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            try {
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(15_000);
                c.setReadTimeout(25_000);
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Accept", "application/rss+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5");
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    if (loc == null || loc.isEmpty()) throw new IOException("moved with no address");
                    u = new URL(new URL(u), loc).toString();
                    continue;
                }
                if (code != 200) throw new IOException("HTTP " + code);
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
                    byte[] buf = new byte[16 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        if (out.size() > max) throw new IOException("too big");
                    }
                    return out.toByteArray();
                }
            } finally {
                c.disconnect();
            }
        }
        throw new IOException("too many redirects");
    }

    private static String text(byte[] b) {
        return new String(b, StandardCharsets.UTF_8);
    }

    private static String keep(File cache, String json) {
        if (cache == null) return json;
        try {
            File dir = cache.getParentFile();
            if (dir != null && !dir.isDirectory() && !dir.mkdirs()) return json;
            File tmp = new File(dir, cache.getName() + ".tmp");
            try (FileOutputStream o = new FileOutputStream(tmp)) {
                o.write(json.getBytes(StandardCharsets.UTF_8));
            }
            if (!tmp.renameTo(cache)) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
        } catch (IOException ignored) { }
        return json;
    }

    private static String readText(File f) {
        if (f == null || !f.isFile() || f.length() > 8_000_000) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream((int) f.length());
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (IOException e) {
            return null;
        }
    }

    /** A top-level string field from our own JSON (the feed address), or "". */
    private static String field(String json, String name) {
        Matcher m = Pattern.compile("\"" + name + "\":\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json.length() > 4000 ? json.substring(0, 4000) : json);
        return m.find() ? unescape(m.group(1)) : "";
    }

    private static String cacheKey(List<String> feeds, String apple, String term) {
        String k = (feeds.isEmpty() ? "" : feeds.get(0)) + "|" + apple + "|" + term;
        try {
            byte[] h = MessageDigest.getInstance("SHA-1").digest(k.getBytes(StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < 10; i++) b.append(String.format(Locale.ROOT, "%02x", h[i]));
            return b.toString();
        } catch (Exception e) {
            return Integer.toHexString(k.hashCode());
        }
    }
}
