package app.biblecast.localserver;

import android.content.ContentResolver;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.channels.FileChannel;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import fi.iki.elonen.NanoHTTPD;

public class BibleCastHttpServer extends NanoHTTPD {

    private final AssetManager assets;

    // ── Vidéo plein écran (route /video/stream) ───────────────────────────
    private ContentResolver videoContentResolver = null;
    private Uri              videoUri            = null;
    private long             videoFileSize       = 0;
    private String           videoMimeType       = "video/mp4";

    // ── Slot vidéo (galerie de fond) ─────────────────────────────────────
    private static class VideoSlot {
        final ContentResolver cr;
        final Uri             uri;
        final long            size;
        final String          mime;
        VideoSlot(ContentResolver cr, Uri uri, long size, String mime) {
            this.cr   = cr;
            this.uri  = uri;
            this.size = size;
            this.mime = (mime != null && !mime.isEmpty()) ? mime : "video/mp4";
        }
    }

    // ── Galerie vidéos de fond (routes /video/bg/{slot}) ─────────────────
    private final Map<Integer, VideoSlot> bgSlots = new ConcurrentHashMap<>();

    public BibleCastHttpServer(AssetManager assets, int port) throws IOException {
        super(port);
        this.assets = assets;
        start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
    }

    /** Enregistre la vidéo plein écran à streamer. */
    public synchronized void setVideo(ContentResolver cr, Uri uri, long size, String mime) {
        this.videoContentResolver = cr;
        this.videoUri             = uri;
        this.videoFileSize        = size;
        this.videoMimeType        = (mime != null && !mime.isEmpty()) ? mime : "video/mp4";
    }

    /** Efface la vidéo plein écran. */
    public synchronized void clearVideo() {
        this.videoContentResolver = null;
        this.videoUri             = null;
        this.videoFileSize        = 0;
    }

    /** Enregistre une vidéo de fond dans le slot donné (0–4). */
    public void setBgVideo(int slot, ContentResolver cr, Uri uri, long size, String mime) {
        bgSlots.put(slot, new VideoSlot(cr, uri, size, mime));
    }

    /** Efface le slot de vidéo de fond. */
    public void clearBgVideo(int slot) {
        bgSlots.remove(slot);
    }

    /** Efface tous les slots de vidéo de fond. */
    public void clearAllBgVideos() {
        bgSlots.clear();
    }

    // ────────────────────────────────────────────────────────────────────
    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();
        if (uri == null) uri = "/";

        // Routes vidéo — testées EN PREMIER (avant le fallback assets)
        if (uri.startsWith("/video/")) {
            // Galerie vidéos de fond : /video/bg/{slot}
            if (uri.startsWith("/video/bg/")) {
                String slotStr = uri.substring("/video/bg/".length()).split("\\?")[0];
                int slot = 0;
                try { slot = Integer.parseInt(slotStr); } catch (NumberFormatException ignored) {}
                return serveBgVideoStream(slot, session);
            }
            // Vidéo plein écran : /video/stream
            return serveVideoStream(session);
        }

        // Route assets statiques (app React)
        String path = uri.startsWith("/") ? uri.substring(1) : uri;
        if (path.isEmpty()) path = "index.html";
        path = path.split("\\?")[0];

        try {
            InputStream stream = assets.open("public/" + path);
            return newChunkedResponse(Response.Status.OK, getMimeType(path), stream);
        } catch (IOException e) {
            try {
                InputStream stream = assets.open("public/index.html");
                return newChunkedResponse(Response.Status.OK, "text/html; charset=utf-8", stream);
            } catch (IOException ex) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found");
            }
        }
    }

    // ── Streaming vidéo plein écran (/video/stream) ───────────────────────
    private Response serveVideoStream(IHTTPSession session) {
        final ContentResolver cr;
        final Uri             uri;
        final long            fileSize;
        final String          mime;

        synchronized (this) {
            if (videoUri == null || videoContentResolver == null) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND,
                        "text/plain", "No video loaded");
            }
            cr       = videoContentResolver;
            uri      = videoUri;
            fileSize = videoFileSize;
            mime     = videoMimeType;
        }

        return serveVideoData(cr, uri, fileSize, mime, session);
    }

    // ── Streaming vidéo de fond (/video/bg/{slot}) ────────────────────────
    private Response serveBgVideoStream(int slot, IHTTPSession session) {
        VideoSlot vs = bgSlots.get(slot);
        if (vs == null) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND,
                    "text/plain", "No bg video in slot " + slot);
        }
        return serveVideoData(vs.cr, vs.uri, vs.size, vs.mime, session);
    }

    // ── Méthode commune : HTTP Range + seek O(1) via FileChannel ──────────
    //
    // CRITIQUE : NE PAS utiliser InputStream.skip() pour les grandes offsets —
    // cela lit et jette les octets un par un via Binder ContentResolver, saturant
    // les threads NanoHTTPD et faisant perdre la connexion WebSocket.
    //
    // FileChannel.position(start) = un seul lseek() côté kernel, instantané.
    // ─────────────────────────────────────────────────────────────────────────
    private Response serveVideoData(ContentResolver cr, Uri uri, long fileSize,
                                    String mime, IHTTPSession session) {

        Map<String, String> headers = session.getHeaders();
        String rangeHeader = headers.get("range");

        long start = 0;
        long end   = fileSize > 0 ? fileSize - 1 : -1;
        boolean isRangeRequest = false;

        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            isRangeRequest = true;
            String rangeSpec = rangeHeader.substring(6);
            String[] parts = rangeSpec.split("-", 2);
            try {
                if (!parts[0].isEmpty()) start = Long.parseLong(parts[0].trim());
                if (parts.length > 1 && !parts[1].isEmpty()) end = Long.parseLong(parts[1].trim());
            } catch (NumberFormatException ignored) {
                start = 0;
                end   = fileSize > 0 ? fileSize - 1 : -1;
            }
            if (start < 0) start = 0;
            if (fileSize > 0 && end >= fileSize) end = fileSize - 1;
            if (end >= 0 && start > end) start = end;
        }

        try {
            // ── Méthode 1 : ParcelFileDescriptor + FileChannel.position() ──────
            // Seek O(1) via lseek() kernel — pas de lecture inutile
            ParcelFileDescriptor pfd = null;
            try {
                pfd = cr.openFileDescriptor(uri, "r");
            } catch (Exception ignored) { }

            if (pfd != null) {
                long actualSize = fileSize;
                if (actualSize <= 0) {
                    actualSize = pfd.getStatSize();
                    if (actualSize < 0) actualSize = 0;
                }
                long actualEnd = end;
                if (actualSize > 0 && actualEnd < 0) actualEnd = actualSize - 1;

                final long length = (actualEnd >= start) ? actualEnd - start + 1 : -1;
                final ParcelFileDescriptor pfdFinal = pfd;

                FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
                if (start > 0) {
                    FileChannel ch = fis.getChannel();
                    ch.position(start);   // O(1) — instantané
                }

                InputStream bounded = (length > 0)
                        ? new LimitedInputStream(new PfdInputStream(fis, pfdFinal), length)
                        : new PfdInputStream(fis, pfdFinal);

                Response response;
                if (isRangeRequest && actualSize > 0) {
                    response = newFixedLengthResponse(Response.Status.PARTIAL_CONTENT,
                            mime, bounded, length > 0 ? length : -1);
                    response.addHeader("Content-Range",
                            "bytes " + start + "-" + actualEnd + "/" + actualSize);
                } else {
                    response = (length > 0)
                            ? newFixedLengthResponse(Response.Status.OK, mime, bounded, length)
                            : newChunkedResponse(Response.Status.OK, mime, bounded);
                }
                response.addHeader("Accept-Ranges", "bytes");
                response.addHeader("Access-Control-Allow-Origin", "*");
                response.addHeader("Cache-Control", "no-cache");
                return response;

            } else {
                // ── Méthode 2 : fallback InputStream (ex: contenus cloud) ────────
                InputStream is = cr.openInputStream(uri);
                if (is == null) {
                    return newFixedLengthResponse(Response.Status.INTERNAL_ERROR,
                            "text/plain", "Cannot open video stream");
                }
                long skipped = 0;
                while (skipped < start) {
                    long n = is.skip(start - skipped);
                    if (n <= 0) break;
                    skipped += n;
                }
                long length = (end >= start) ? end - start + 1 : -1;
                InputStream bounded = (length > 0) ? new LimitedInputStream(is, length) : is;

                Response response;
                if (isRangeRequest && fileSize > 0) {
                    response = newFixedLengthResponse(Response.Status.PARTIAL_CONTENT,
                            mime, bounded, length > 0 ? length : -1);
                    response.addHeader("Content-Range",
                            "bytes " + start + "-" + end + "/" + fileSize);
                } else {
                    response = (length > 0)
                            ? newFixedLengthResponse(Response.Status.OK, mime, bounded, length)
                            : newChunkedResponse(Response.Status.OK, mime, bounded);
                }
                response.addHeader("Accept-Ranges", "bytes");
                response.addHeader("Access-Control-Allow-Origin", "*");
                response.addHeader("Cache-Control", "no-cache");
                return response;
            }

        } catch (IOException e) {
            android.util.Log.e("BibleCastHttp", "serveVideoData erreur: " + e.getMessage());
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR,
                    "text/plain", "Video stream error: " + e.getMessage());
        }
    }

    // ── InputStream qui ferme aussi le ParcelFileDescriptor ──────────────
    private static class PfdInputStream extends InputStream {
        private final FileInputStream    fis;
        private final ParcelFileDescriptor pfd;

        PfdInputStream(FileInputStream fis, ParcelFileDescriptor pfd) {
            this.fis = fis;
            this.pfd = pfd;
        }

        @Override public int  read()                              throws IOException { return fis.read(); }
        @Override public int  read(byte[] b, int off, int len)   throws IOException { return fis.read(b, off, len); }
        @Override public int  available()                        throws IOException { return fis.available(); }

        @Override
        public void close() throws IOException {
            try { fis.close(); } finally {
                try { pfd.close(); } catch (Exception ignored) { }
            }
        }
    }

    // ── InputStream limité à N octets ─────────────────────────────────────
    private static class LimitedInputStream extends InputStream {
        private final InputStream wrapped;
        private long remaining;

        LimitedInputStream(InputStream wrapped, long limit) {
            this.wrapped   = wrapped;
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = wrapped.read();
            if (b >= 0) remaining--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int toRead = (int) Math.min(len, remaining);
            int n = wrapped.read(buf, off, toRead);
            if (n > 0) remaining -= n;
            return n;
        }

        @Override
        public void close() throws IOException { wrapped.close(); }
    }

    // ── MIME types ────────────────────────────────────────────────────────
    private String getMimeType(String path) {
        if (path.endsWith(".html"))                          return "text/html; charset=utf-8";
        if (path.endsWith(".js") || path.endsWith(".mjs"))  return "application/javascript";
        if (path.endsWith(".css"))                           return "text/css";
        if (path.endsWith(".json"))                          return "application/json";
        if (path.endsWith(".png"))                           return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg"))                           return "image/svg+xml";
        if (path.endsWith(".ico"))                           return "image/x-icon";
        if (path.endsWith(".woff2"))                         return "font/woff2";
        if (path.endsWith(".woff"))                          return "font/woff";
        if (path.endsWith(".ttf"))                           return "font/ttf";
        if (path.endsWith(".webp"))                          return "image/webp";
        if (path.endsWith(".mp4") || path.endsWith(".m4v"))  return "video/mp4";
        if (path.endsWith(".webm"))                          return "video/webm";
        if (path.endsWith(".mkv"))                           return "video/x-matroska";
        if (path.endsWith(".mov"))                           return "video/quicktime";
        if (path.endsWith(".avi"))                           return "video/x-msvideo";
        return "application/octet-stream";
    }
}
