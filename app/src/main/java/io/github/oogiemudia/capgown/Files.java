package io.github.oogiemudia.capgown;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import java.io.OutputStream;

/** Saves files into the phone's Downloads folder (backups, calendar files, files from the chat). */
final class Files {

    private Files() { }

    static String safeName(String name) {
        String s = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return s.isEmpty() ? "download" : s;
    }

    /** Works on Android 10 and later. Returns false on older phones or if the save fails. */
    static boolean saveToDownloads(Context context, String name, byte[] bytes, String mime) {
        if (Build.VERSION.SDK_INT < 29 || bytes == null) return false;
        ContentResolver cr = context.getContentResolver();
        ContentValues cv = new ContentValues();
        cv.put(MediaStore.Downloads.DISPLAY_NAME, safeName(name));
        cv.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
        cv.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) return false;
            try (OutputStream os = cr.openOutputStream(uri)) {
                if (os == null) return false;
                os.write(bytes);
            }
            cv.clear();
            cv.put(MediaStore.Downloads.IS_PENDING, 0);
            cr.update(uri, cv, null, null);
            return true;
        } catch (Exception e) {
            if (uri != null) {
                try { cr.delete(uri, null, null); } catch (Exception ignored) { }
            }
            return false;
        }
    }
}
