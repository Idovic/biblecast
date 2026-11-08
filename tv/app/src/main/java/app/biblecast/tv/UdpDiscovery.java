package app.biblecast.tv;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;

/**
 * Écoute les broadcasts UDP de la tablette BibleCast sur le port 8099.
 *
 * Format : "BIBLECAST_ANNOUNCE:{ip}:{httpPort}:{wsPort}[:{deviceId}]"
 * Exemple : "BIBLECAST_ANNOUNCE:192.168.1.192:8090:8091"
 *
 * CORRECTION CRITIQUE — MulticastLock :
 *   Android filtre les paquets broadcast/multicast au niveau du chipset WiFi
 *   pour économiser la batterie, même si CHANGE_WIFI_MULTICAST_STATE est déclaré.
 *   Sans WifiManager.MulticastLock.acquire(), le socket ne reçoit JAMAIS rien.
 *
 * CORRECTION — setReuseAddress AVANT bind :
 *   En Java, setReuseAddress() doit précéder bind(); sinon sans effet.
 *   DatagramSocket(port) fait bind() dans le constructeur → ordre impossible.
 *   Solution : DatagramSocket(null) + setReuseAddress + bind(InetSocketAddress).
 */
public class UdpDiscovery {

    private static final String TAG            = "BibleCastTV-UDP";
    private static final int    UDP_PORT       = 8099;
    private static final String MSG_PREFIX     = "BIBLECAST_ANNOUNCE:";
    private static final int    BUFFER_SIZE    = 512;
    private static final int    SOCKET_TIMEOUT = 10_000; // 10 s → relance le socket

    public interface DiscoveryListener {
        /** Appelé sur le thread principal avec l'URL HTTP du Display. */
        void onDiscovered(String displayUrl, String wsUrl, String deviceId);
    }

    private final Context            appContext;
    private final DiscoveryListener  listener;
    private final Handler            mainHandler = new Handler(Looper.getMainLooper());

    private Thread                    workerThread;
    private volatile boolean          running   = false;
    private WifiManager.MulticastLock multicastLock;

    public UdpDiscovery(Context context, DiscoveryListener listener) {
        this.appContext = context.getApplicationContext();
        this.listener   = listener;
    }

    /** Acquiert le MulticastLock puis démarre l'écoute UDP en arrière-plan. */
    public void start() {
        if (running) return;

        // ── MulticastLock OBLIGATOIRE — sans lui, zéro paquet reçu ──
        try {
            WifiManager wifi = (WifiManager)
                    appContext.getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                multicastLock = wifi.createMulticastLock("biblecast-tv-discovery");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
                Log.d(TAG, "MulticastLock acquis");
            } else {
                Log.w(TAG, "WifiManager null — broadcasts peuvent ne pas être reçus");
            }
        } catch (Exception e) {
            Log.w(TAG, "MulticastLock erreur : " + e.getMessage());
        }

        running      = true;
        workerThread = new Thread(this::listenLoop, "biblecast-tv-udp");
        workerThread.setDaemon(true);
        workerThread.start();
        Log.d(TAG, "Discovery démarrée sur port " + UDP_PORT);
    }

    /** Arrête l'écoute et relâche le MulticastLock. */
    public void stop() {
        running = false;
        if (workerThread != null) {
            workerThread.interrupt();
            workerThread = null;
        }
        releaseLock();
        Log.d(TAG, "Discovery arrêtée");
    }

    private void releaseLock() {
        if (multicastLock != null) {
            try {
                if (multicastLock.isHeld()) multicastLock.release();
            } catch (Exception e) {
                Log.w(TAG, "Release MulticastLock erreur : " + e.getMessage());
            }
            multicastLock = null;
            Log.d(TAG, "MulticastLock relâché");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    private void listenLoop() {
        while (running && !Thread.currentThread().isInterrupted()) {
            DatagramSocket socket = null;
            try {
                // ── Ordre OBLIGATOIRE : non-lié → setReuseAddress → bind ──
                socket = new DatagramSocket(null); // pas encore lié
                socket.setReuseAddress(true);       // doit précéder bind()
                socket.setBroadcast(true);
                socket.bind(new InetSocketAddress(UDP_PORT)); // bind ici
                socket.setSoTimeout(SOCKET_TIMEOUT);

                Log.d(TAG, "Socket lié sur :" + UDP_PORT + " — attente broadcast tablette…");

                byte[]         buf    = new byte[BUFFER_SIZE];
                DatagramPacket packet = new DatagramPacket(buf, buf.length);

                while (running && !Thread.currentThread().isInterrupted()) {
                    try {
                        packet.setLength(buf.length);
                        socket.receive(packet);

                        String raw = new String(
                                packet.getData(), 0, packet.getLength(), "UTF-8").trim();
                        Log.d(TAG, "UDP reçu [" + packet.getAddress() + "] : " + raw);

                        if (!raw.startsWith(MSG_PREFIX)) continue;

                        // "BIBLECAST_ANNOUNCE:{ip}:{httpPort}:{wsPort}"
                        String[] parts = raw.substring(MSG_PREFIX.length()).split(":");
                        if (parts.length < 3) {
                            Log.w(TAG, "Message mal formé : " + raw);
                            continue;
                        }

                        String ip       = parts[0].trim();
                        String httpPort = parts[1].trim();
                        String wsPort   = parts[2].trim();
                        // 4e champ optionnel : identifiant de la tablette (appairage)
                        String devId    = parts.length >= 4 ? parts[3].trim() : "";

                        if (ip.isEmpty() || ip.equals("127.0.0.1")) continue;

                        String displayUrl = "http://" + ip + ":" + httpPort + "/display?local=1";
                        String wsUrl      = "ws://"   + ip + ":" + wsPort;

                        Log.d(TAG, "Tablette trouvee -> " + displayUrl);

                        final String fUrl = displayUrl;
                        final String fWs  = wsUrl;
                        final String fId  = devId;
                        mainHandler.post(() -> listener.onDiscovered(fUrl, fWs, fId));

                    } catch (java.net.SocketTimeoutException ignored) {
                        // Timeout normal — reboucle pour maintenir l'écoute active
                    }
                }

            } catch (Exception e) {
                if (running) {
                    Log.w(TAG, "Erreur socket UDP ("
                            + e.getClass().getSimpleName() + ") : " + e.getMessage()
                            + " — relance dans 2s");
                    try { Thread.sleep(2000); } catch (InterruptedException ie) { break; }
                }
            } finally {
                if (socket != null && !socket.isClosed()) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        }
        Log.d(TAG, "listenLoop() terminee");
    }
}
