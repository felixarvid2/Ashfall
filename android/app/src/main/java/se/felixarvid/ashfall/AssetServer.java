package se.felixarvid.ashfall;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the APK's assets on https://appassets.androidplatform.net/ for shouldInterceptRequest:
 * {@code /panel/...} comes from assets/panel/, everything else from assets/www/. Sets a Content-Type per
 * extension and supports byte ranges (206 + Content-Range), so audio and large models can be seeked.
 */
final class AssetServer {
    static final String HOST = "appassets.androidplatform.net";

    private final AssetManager assets;

    AssetServer(AssetManager assets) {
        this.assets = assets;
    }

    /** @return the response, or null for a request that is not ours (the WebView then handles it). */
    WebResourceResponse serve(WebResourceRequest req) {
        Uri uri = req.getUrl();
        if (uri == null || !"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return null;
        String method = req.getMethod();
        if (method != null && !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) return null;
        String path = uri.getPath();
        if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
        else if (path.endsWith("/")) path = path + "index.html";
        if (path.contains("..") || path.contains("\\")) return notFound();
        String assetPath = path.startsWith("/panel/") ? "panel/" + path.substring(7) : "www" + path;

        String range = null;
        Map<String, String> rh = req.getRequestHeaders();
        if (rh != null) {
            for (Map.Entry<String, String> e : rh.entrySet()) {
                if ("Range".equalsIgnoreCase(e.getKey())) range = e.getValue();
            }
        }
        InputStream in = null;
        try {
            in = assets.open(assetPath, AssetManager.ACCESS_STREAMING);
            long total = in.available(); // remaining uncompressed length; the whole file at this point
            String mime = mimeFor(assetPath);
            String enc = mime.startsWith("text/") || mime.equals("application/json") ? "utf-8" : null;
            Map<String, String> h = new HashMap<>();
            h.put("Accept-Ranges", "bytes");
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-cache");

            long[] r = range == null ? null : parseRange(range, total);
            if (range != null && r == null) {
                in.close();
                h.put("Content-Range", "bytes */" + total);
                return new WebResourceResponse(mime, enc, 416, "Range Not Satisfiable", h, new ByteArrayInputStream(new byte[0]));
            }
            if (r == null) {
                h.put("Content-Length", String.valueOf(total));
                return new WebResourceResponse(mime, enc, 200, "OK", h, in);
            }
            long start = r[0], end = r[1], len = end - start + 1;
            skipFully(in, start);
            h.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
            h.put("Content-Length", String.valueOf(len));
            return new WebResourceResponse(mime, enc, 206, "Partial Content", h, new Limited(in, len));
        } catch (IOException e) {
            if (in != null) {
                try {
                    in.close();
                } catch (IOException ignored) {
                }
            }
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0]));
    }

    /** Parses a single "bytes=a-b" / "bytes=a-" / "bytes=-n" range; null when malformed or unsatisfiable. */
    static long[] parseRange(String header, long total) {
        try {
            String v = header.trim().toLowerCase(Locale.ROOT);
            if (!v.startsWith("bytes=") || total <= 0) return null;
            String spec = v.substring(6).split(",")[0].trim();
            int dash = spec.indexOf('-');
            if (dash < 0) return null;
            String a = spec.substring(0, dash).trim(), b = spec.substring(dash + 1).trim();
            long start, end;
            if (a.isEmpty()) {
                long n = Long.parseLong(b);
                if (n <= 0) return null;
                start = Math.max(0, total - n);
                end = total - 1;
            } else {
                start = Long.parseLong(a);
                end = b.isEmpty() ? total - 1 : Math.min(Long.parseLong(b), total - 1);
            }
            if (start < 0 || start >= total || end < start) return null;
            return new long[]{start, end};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static void skipFully(InputStream in, long n) throws IOException {
        long left = n;
        while (left > 0) {
            long s = in.skip(left);
            if (s <= 0) {
                if (in.read() < 0) throw new IOException("EOF while skipping");
                s = 1;
            }
            left -= s;
        }
    }

    static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "wasm": return "application/wasm";
            case "glb": return "model/gltf-binary";
            case "gltf": return "model/gltf+json";
            case "ktx2": return "image/ktx2";
            case "png": return "image/png";
            case "webp": return "image/webp";
            case "jpg": case "jpeg": return "image/jpeg";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "ogg": return "audio/ogg";
            case "mp3": return "audio/mpeg";
            case "wav": return "audio/wav";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "txt": return "text/plain";
            default: return "application/octet-stream";
        }
    }

    /** Stream that ends after {@code left} bytes. */
    private static final class Limited extends FilterInputStream {
        private long left;

        Limited(InputStream in, long left) {
            super(in);
            this.left = left;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = super.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = super.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), left);
        }
    }
}
