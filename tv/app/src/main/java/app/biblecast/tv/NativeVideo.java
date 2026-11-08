package app.biblecast.tv;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.CacheWriter;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lecteur vidéo natif (Media3 / ExoPlayer) piloté depuis la page Display.
 *
 * Exposé à la page sous window.BibleCastTV. La vue du lecteur reste à
 * alpha 0 jusqu'à la première image décodée, puis apparaît en fondu
 * par-dessus le contenu en cours : plus d'écran noir ni d'icône grise.
 * Les changements d'état sont renvoyés à la page via window.__bcVideoEvent().
 */
public class NativeVideo {

    private static final long FADE_IN_MS  = 450;
    private static final long FADE_OUT_MS = 400;

    private final MainActivity activity;
    private final WebView      webView;
    private final PlayerView   view;
    private final Handler      main = new Handler(Looper.getMainLooper());
    private ExoPlayer          player;
    private String             currentUrl = null;

    // ── Cache local des vidéos (3 Go max, les plus anciennes sont effacées) ──
    private static SimpleCache cache;
    private final ExecutorService prefetchPool = Executors.newSingleThreadExecutor();

    private static synchronized SimpleCache getCache(Context ctx) {
        if (cache == null) {
            cache = new SimpleCache(new File(ctx.getCacheDir(), "biblecast-media"),
                    new LeastRecentlyUsedCacheEvictor(3L * 1024 * 1024 * 1024),
                    new StandaloneDatabaseProvider(ctx));
        }
        return cache;
    }

    private CacheDataSource.Factory cacheFactory() {
        return new CacheDataSource.Factory()
                .setCache(getCache(activity))
                .setUpstreamDataSourceFactory(new DefaultHttpDataSource.Factory()
                        .setAllowCrossProtocolRedirects(true)
                        .setConnectTimeoutMs(8000).setReadTimeoutMs(15000))
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
    }

    private final Runnable progressTick = new Runnable() {
        @Override public void run() {
            if (player != null && player.isPlaying()) {
                emit("progress", null);
                main.postDelayed(this, 1000);
            }
        }
    };

    public NativeVideo(MainActivity activity, WebView webView, PlayerView view) {
        this.activity = activity;
        this.webView  = webView;
        this.view     = view;
    }

    // ── API appelée depuis la page (thread JavaBridge → on repasse sur le thread UI) ──

    @JavascriptInterface public boolean isAvailable() { return true; }

    @JavascriptInterface public String version() { return activity.appVersion(); }

    @JavascriptInterface
    public void play(final String url, final String optionsJson) {
        main.post(() -> doPlay(url, optionsJson));
    }

    @JavascriptInterface public void pause()  { main.post(() -> { if (player != null) player.pause(); }); }

    @JavascriptInterface public void resume() { main.post(() -> { if (player != null) player.play(); }); }

    @JavascriptInterface public void stop()   { main.post(this::doStop); }

    @JavascriptInterface
    public void seekTo(final double seconds) {
        main.post(() -> { if (player != null) player.seekTo((long) Math.max(0, seconds * 1000)); });
    }

    @JavascriptInterface
    public void seekBy(final double seconds) {
        main.post(() -> {
            if (player == null) return;
            long target = player.getCurrentPosition() + (long) (seconds * 1000);
            long dur = player.getDuration();
            if (dur > 0) target = Math.min(target, dur);
            player.seekTo(Math.max(0, target));
        });
    }

    /** Copie la vidéo dans la mémoire de la TV (avant le culte). Progression renvoyée à la page. */
    @JavascriptInterface
    public void prefetch(final String url) {
        if (url == null || url.isEmpty()) return;
        prefetchPool.execute(() -> {
            final long[] last = {0};
            try {
                CacheWriter writer = new CacheWriter(cacheFactory().createDataSource(),
                        new DataSpec(Uri.parse(url)), null,
                        (requestLength, bytesCached, newBytesCached) -> {
                            long now = System.currentTimeMillis();
                            if (now - last[0] > 1000 && requestLength > 0) {
                                last[0] = now;
                                emitCache(url, "cache", (int) (bytesCached * 100 / requestLength), null);
                            }
                        });
                writer.cache();
                emitCache(url, "cached", 100, null);
            } catch (Exception e) {
                emitCache(url, "error", 0, "copie impossible : " + e.getClass().getSimpleName());
            }
        });
    }

    @JavascriptInterface
    public void setVolume(final double volume) {
        main.post(() -> { if (player != null) player.setVolume((float) Math.max(0, Math.min(1, volume))); });
    }

    // ── Interne ──────────────────────────────────────────────────────────────

    private void ensurePlayer() {
        if (player != null) return;
        // Lecture via le cache : une vidéo préparée avant le culte se lit depuis la TV
        player = new ExoPlayer.Builder(activity)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(cacheFactory()))
                .build();
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onRenderedFirstFrame() {
                view.animate().cancel();
                view.animate().alpha(1f).setDuration(FADE_IN_MS).start();
                emit("ready", null);
            }

            @Override public void onIsPlayingChanged(boolean isPlaying) {
                emit(isPlaying ? "playing" : "paused", null);
                main.removeCallbacks(progressTick);
                if (isPlaying) main.post(progressTick);
            }

            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) emit("buffering", null);
                if (state == Player.STATE_ENDED)     emit("ended", null);
            }

            @Override public void onPlayerError(@NonNull PlaybackException error) {
                emit("error", error.getErrorCodeName());
                fadeOut(null);
            }
        });
    }

    private void doPlay(String url, String optionsJson) {
        if (url == null || url.isEmpty()) return;
        boolean loop = false;
        double volume = 1.0, startAt = 0;
        try {
            if (optionsJson != null && !optionsJson.isEmpty()) {
                JSONObject o = new JSONObject(optionsJson);
                loop    = o.optBoolean("loop", false);
                volume  = o.optDouble("volume", 1.0);
                startAt = o.optDouble("startAt", 0);
            }
        } catch (Exception ignored) { }

        ensurePlayer();
        view.animate().cancel();
        view.setAlpha(0f);
        currentUrl = url;
        player.setMediaItem(MediaItem.fromUri(url));
        player.setRepeatMode(loop ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
        player.setVolume((float) volume);
        player.prepare();
        if (startAt > 0) player.seekTo((long) (startAt * 1000));
        player.setPlayWhenReady(true);
        emit("loading", null);
    }

    private void doStop() {
        if (player == null) return;
        main.removeCallbacks(progressTick);
        fadeOut(() -> {
            if (player != null) { player.stop(); player.clearMediaItems(); }
            currentUrl = null;
            emit("stopped", null);
        });
    }

    /** Arrêt immédiat, sans fondu (perte de connexion, fermeture). */
    public void stopNow() {
        main.removeCallbacks(progressTick);
        view.animate().cancel();
        view.setAlpha(0f);
        if (player != null) { player.stop(); player.clearMediaItems(); }
        currentUrl = null;
    }

    public void release() {
        stopNow();
        prefetchPool.shutdownNow();
        if (player != null) { player.release(); player = null; }
    }

    private void fadeOut(Runnable end) {
        view.animate().cancel();
        if (end != null) view.animate().alpha(0f).setDuration(FADE_OUT_MS).withEndAction(end).start();
        else view.animate().alpha(0f).setDuration(FADE_OUT_MS).start();
    }

    private void emitCache(String url, String state, int percent, String error) {
        try {
            JSONObject o = new JSONObject();
            o.put("state", state);
            o.put("url", url);
            o.put("percent", percent);
            if (error != null) o.put("error", error);
            final String js = "window.__bcVideoEvent && window.__bcVideoEvent(" + o + ");";
            main.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }

    private void emit(String state, String error) {
        try {
            JSONObject o = new JSONObject();
            o.put("state", state);
            if (currentUrl != null) o.put("url", currentUrl);
            if (player != null) {
                o.put("position", player.getCurrentPosition() / 1000.0);
                long d = player.getDuration();
                o.put("duration", d > 0 ? d / 1000.0 : 0);
            }
            if (error != null) o.put("error", error);
            final String js = "window.__bcVideoEvent && window.__bcVideoEvent(" + o + ");";
            main.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }
}
