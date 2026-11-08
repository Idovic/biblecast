package app.biblecast.tv;

import android.animation.ArgbEvaluator;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.graphics.drawable.GradientDrawable;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.ui.PlayerView;

import java.util.UUID;

/**
 * Activité principale de l'APK Android TV BibleCast.
 *
 * États :
 *  – WAITING   : écran d'attente animé (tablette non détectée)
 *  – CONNECTED : WebView plein écran chargeant Display.tsx de la tablette
 *
 * CORRECTION PRINCIPALE — Android "no internet" WiFi penalty :
 *  Quand la TV est sur un WiFi sans internet (box locale), Android marque ce
 *  réseau comme "non validé" et peut refuser les connexions HTTP sur ce réseau,
 *  même avec usesCleartextTraffic="true". bindToWifiNetwork() force le processus
 *  à utiliser le WiFi même non validé → tablette toujours accessible.
 *
 * CORRECTION — onReceivedError résiliente :
 *  Au lieu de capituler au premier onReceivedError (boucle infinie), on tente
 *  3 rechargements avant de revenir à l'écran d'attente.
 *
 * CORRECTION — URL explicite ?ws= :
 *  Utilise ?ws=ws://ip:port plutôt que ?local=1 pour éviter l'ambiguïté sur
 *  le hostname détecté par Display.tsx depuis window.location.
 */
public class MainActivity extends AppCompatActivity implements UdpDiscovery.DiscoveryListener {

    private static final String TAG           = "BibleCastTV";
    private static final int    MAX_WV_ERRORS = 3;     // tentatives avant de capituler
    private static final long   RETRY_DELAY   = 2500L; // délai entre tentatives (ms)

    // Vues
    private View     waitingLayout;
    private View     webviewLayout;
    private WebView  webView;
    private TextView tvStatus;

    // Discovery
    private UdpDiscovery discovery;

    // Lecteur vidéo natif (exposé à la page sous window.BibleCastTV)
    private NativeVideo nativeVideo;

    // Appairage : la TV ne suit que « sa » tablette
    private static final String PREFS        = "BibleCastTV";
    private static final String KEY_PAIRED   = "pairedTabletId";
    private static final String KEY_TV_ID    = "tvId";
    private SharedPreferences prefs;
    private String  currentDeviceId   = null;
    private long    lastIgnoredNotice = 0;

    // État courant
    private String  currentDisplayUrl = null;
    private boolean isConnected       = false;
    private int     webViewErrorCount = 0;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // NetworkCallback maintenu en référence forte pour éviter le GC
    private ConnectivityManager.NetworkCallback wifiNetworkCallback;

    // ─────────────────────────────────────────────────────────────────────
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Plein écran immersif — masque barres système
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );

        setContentView(R.layout.activity_main);

        waitingLayout = findViewById(R.id.waiting_layout);
        webviewLayout = findViewById(R.id.webview_layout);
        webView       = findViewById(R.id.webview);
        tvStatus      = findViewById(R.id.tv_status);
        prefs         = getSharedPreferences(PREFS, MODE_PRIVATE);

        // ── CORRECTION 1 : lier le processus au réseau WiFi ──
        bindToWifiNetwork();

        animateWaitingScreen();
        setupWebView();
        nativeVideo = new NativeVideo(this, webView, (PlayerView) findViewById(R.id.player_view));
        webView.addJavascriptInterface(nativeVideo, "BibleCastTV");
        showWaiting("Recherche de la tablette en cours\u2026");
        startDiscovery();
    }

    // ─────────────────────────────────────────────────────────────────────
    /**
     * Force toutes les connexions du processus à utiliser le réseau WiFi,
     * même si ce WiFi est "non validé" (pas d'accès internet).
     *
     * Android TV sur un réseau local sans internet marque le WiFi comme invalide
     * et peut router les connexions HTTP vers un autre réseau ou les bloquer.
     * bindProcessToNetwork() résout ça en forçant l'interface WiFi.
     */
    private void bindToWifiNetwork() {
        try {
            ConnectivityManager cm =
                    (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                Log.w(TAG, "ConnectivityManager null — binding WiFi impossible");
                return;
            }

            NetworkRequest req = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .build();

            wifiNetworkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    boolean ok = cm.bindProcessToNetwork(network);
                    Log.d(TAG, "bindProcessToNetwork WiFi : " + ok + " (" + network + ")");
                }

                @Override
                public void onLost(Network network) {
                    Log.w(TAG, "Réseau WiFi perdu : " + network);
                }
            };

            cm.requestNetwork(req, wifiNetworkCallback);
            Log.d(TAG, "bindToWifiNetwork() — requête réseau WiFi envoyée");

        } catch (Exception e) {
            Log.w(TAG, "bindToWifiNetwork() erreur : " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    @Override
    public void onDiscovered(String displayUrl, String wsUrl, String deviceId) {
        // ── Appairage : on ignore les autres appareils qui lancent BibleCast ──
        String paired = prefs.getString(KEY_PAIRED, "");
        if (!paired.isEmpty() && !deviceId.isEmpty() && !paired.equals(deviceId)) {
            if (!isConnected) {
                long now = System.currentTimeMillis();
                if (now - lastIgnoredNotice > 10_000) {
                    lastIgnoredNotice = now;
                    showWaiting("Une autre tablette est détectée.\nAppuyez sur OK pour l'utiliser à la place.");
                }
            }
            return;
        }

        String encodedWs = Uri.encode(wsUrl);
        String urlToLoad = displayUrl.replace("?local=1", "?ws=" + encodedWs)
                + "&tv=" + Uri.encode(getTvId())
                + "&name=" + Uri.encode(getTvName())
                + "&native=1";

        if (isConnected && urlToLoad.equals(currentDisplayUrl)) return;

        // Première connexion à une tablette récente → on s'appaire
        if (paired.isEmpty() && !deviceId.isEmpty()) {
            prefs.edit().putString(KEY_PAIRED, deviceId).apply();
        }

        Log.d(TAG, "Tablette trouvée → " + urlToLoad);
        currentDisplayUrl = urlToLoad;
        currentDeviceId   = deviceId;
        isConnected       = true;
        webViewErrorCount = 0;

        if (nativeVideo != null) nativeVideo.stopNow();
        showWebView();
        webView.loadUrl(urlToLoad);
    }

    /** Écran d'attente vivant : dégradé qui évolue lentement + logo qui « respire ». */
    private void animateWaitingScreen() {
        try {
            final int[][] palettes = {
                    {0xFF1E1B4B, 0xFF1C2F6B, 0xFF0D1B2A},
                    {0xFF0B2E3A, 0xFF1A2F5C, 0xFF2A1745},
                    {0xFF2A1440, 0xFF1C2F6B, 0xFF0B1F2E},
            };
            final GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, palettes[0].clone());
            waitingLayout.setBackground(g);
            final ArgbEvaluator ev = new ArgbEvaluator();
            ValueAnimator va = ValueAnimator.ofFloat(0f, palettes.length);
            va.setDuration(36_000);
            va.setRepeatCount(ValueAnimator.INFINITE);
            va.addUpdateListener(a -> {
                float t = (float) a.getAnimatedValue();
                int i = (int) Math.floor(t) % palettes.length, j = (i + 1) % palettes.length;
                float f = t - (float) Math.floor(t);
                int[] c = new int[3];
                for (int k = 0; k < 3; k++) c[k] = (int) ev.evaluate(f, palettes[i][k], palettes[j][k]);
                g.setColors(c);
            });
            va.start();
            View logo = findViewById(R.id.iv_logo);
            if (logo != null) {
                ObjectAnimator pulse = ObjectAnimator.ofFloat(logo, "alpha", 1f, 0.6f);
                pulse.setDuration(3000);
                pulse.setRepeatMode(ValueAnimator.REVERSE);
                pulse.setRepeatCount(ValueAnimator.INFINITE);
                pulse.start();
            }
            TextView hint = findViewById(R.id.tv_hint);
            if (hint != null) {
                hint.setText(hint.getText() + "\n\nCet écran : " + getTvName()
                        + "  ·  OK sur la télécommande = changer de tablette");
            }
        } catch (Exception e) {
            Log.w(TAG, "animation attente : " + e.getMessage());
        }
    }

    /** Identifiant stable de cette TV (envoyé à la tablette). */
    private String getTvId() {
        String id = prefs.getString(KEY_TV_ID, "");
        if (id.isEmpty()) {
            id = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
            prefs.edit().putString(KEY_TV_ID, id).apply();
        }
        return id;
    }

    private String getTvName() {
        String model = android.os.Build.MODEL != null ? android.os.Build.MODEL : "TV";
        return model + " · " + getTvId().substring(0, 4).toUpperCase();
    }

    /** Version de l'app TV (BuildConfig n'est pas généré par AGP 8). */
    public String appVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return "?"; }
    }

    // ── Télécommande : flèches = suivant / précédent ; OK sur l'attente = changer de tablette ──
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() != KeyEvent.ACTION_DOWN || event.getRepeatCount() > 0) {
            return super.dispatchKeyEvent(event);
        }
        int code = event.getKeyCode();
        if (isConnected) {
            String dir = null;
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_PAGE_DOWN:
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                case KeyEvent.KEYCODE_MEDIA_NEXT:
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                    dir = "next"; break;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_PAGE_UP:
                case KeyEvent.KEYCODE_CHANNEL_UP:
                case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                    dir = "prev"; break;
                default: break;
            }
            if (dir != null) {
                webView.evaluateJavascript(
                        "window.__bcRemote && window.__bcRemote('" + dir + "');", null);
                return true;
            }
        } else if (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER) {
            prefs.edit().remove(KEY_PAIRED).apply();
            showWaiting("Appairage effacé — recherche de la tablette…");
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    // ─────────────────────────────────────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);   // cache activé (plus stable)
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setTextZoom(100);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setBackgroundColor(Color.BLACK);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public void onPageFinished(WebView view, String url) {
                // Page chargée avec succès → reset compteur d'erreurs
                webViewErrorCount = 0;
                Log.d(TAG, "Page chargée OK : " + url);
            }

            // ── CORRECTION 3 : onReceivedError résilient ──
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                if (!request.isForMainFrame()) return; // ignorer les erreurs sub-ressources

                webViewErrorCount++;
                Log.w(TAG, "WebView erreur #" + webViewErrorCount
                        + "  code=" + error.getErrorCode()
                        + "  desc=" + error.getDescription()
                        + "  url="  + request.getUrl());

                if (webViewErrorCount >= MAX_WV_ERRORS) {
                    Log.e(TAG, "Trop d'erreurs (" + MAX_WV_ERRORS + ") — retour WAITING");
                    webViewErrorCount = 0;
                    handleConnectionLost();
                } else {
                    // Retenter le chargement après RETRY_DELAY ms
                    Log.d(TAG, "Retry WebView dans " + RETRY_DELAY + "ms (tentative "
                            + webViewErrorCount + "/" + MAX_WV_ERRORS + ")");
                    mainHandler.postDelayed(() -> {
                        if (isConnected && currentDisplayUrl != null) {
                            webView.loadUrl(currentDisplayUrl);
                        }
                    }, RETRY_DELAY);
                }
            }

            // ── CORRECTION 4 : bloquer les navigations non-HTTP ──
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                boolean isHttp = url.startsWith("http://") || url.startsWith("https://");
                if (!isHttp) {
                    Log.d(TAG, "Navigation non-HTTP bloquée : " + url);
                }
                return !isHttp; // true = bloquer, false = laisser le WebView gérer
            }
        });

        // Nécessaire pour médias et plein écran HTML5
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                webView.setVisibility(View.GONE);
                ((FrameLayout) webviewLayout).addView(view);
            }

            @Override
            public void onHideCustomView() {
                webView.setVisibility(View.VISIBLE);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    private void startDiscovery() {
        if (discovery != null) discovery.stop();
        discovery = new UdpDiscovery(this, this);
        discovery.start();
    }

    private void handleConnectionLost() {
        isConnected       = false;
        currentDisplayUrl = null;
        webViewErrorCount = 0;
        webView.stopLoading();
        webView.loadUrl("about:blank");
        if (nativeVideo != null) nativeVideo.stopNow();
        showWaiting("Connexion perdue\u2026 Recherche de la tablette");
        mainHandler.removeCallbacksAndMessages(null); // annuler les retries en cours
        startDiscovery();
    }

    // ─────────────────────────────────────────────────────────────────────
    private void showWaiting(String statusText) {
        runOnUiThread(() -> {
            if (tvStatus != null) tvStatus.setText(statusText);
            waitingLayout.setVisibility(View.VISIBLE);
            webviewLayout.setVisibility(View.GONE);
        });
    }

    private void showWebView() {
        runOnUiThread(() -> {
            waitingLayout.setVisibility(View.GONE);
            webviewLayout.setVisibility(View.VISIBLE);
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        if (!isConnected) startDiscovery();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Libérer le NetworkCallback pour éviter les fuites mémoire
        try {
            ConnectivityManager cm =
                    (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && wifiNetworkCallback != null) {
                cm.unregisterNetworkCallback(wifiNetworkCallback);
            }
        } catch (Exception ignored) {}

        if (discovery != null) discovery.stop();
        mainHandler.removeCallbacksAndMessages(null);
        if (nativeVideo != null) nativeVideo.release();
        webView.destroy();
    }

    @Override
    public void onBackPressed() {
        // Désactiver le bouton Retour sur TV — évite de sortir accidentellement
    }
}
