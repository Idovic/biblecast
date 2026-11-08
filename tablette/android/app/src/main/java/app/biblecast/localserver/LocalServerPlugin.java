package app.biblecast.localserver;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import android.Manifest;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;

@CapacitorPlugin(
    name = "LocalServer",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class LocalServerPlugin extends Plugin {

    /* ── Serveurs HTTP + WebSocket ── */
    private BibleCastHttpServer httpServer;
    private BibleCastWsServer   wsServer;

    /* ── Clé SharedPreferences pour les vidéos de fond ── */
    private static final String BGVIDEO_PREFS = "BibleCastBgVideos";
    private static final int    BGVIDEO_SLOTS = 5;

    /* ── UDP broadcaster (découverte par l'APK TV) ── */
    static final int    UDP_DISCOVERY_PORT = 8099;
    static final String UDP_PREFIX         = "BIBLECAST_ANNOUNCE:";

    private DatagramSocket   broadcastSocket;
    private Thread           broadcastThread;
    private volatile boolean broadcastRunning = false;

    // ─────────────────────────────────────────────────────────────────────
    @PluginMethod
    public void startServer(PluginCall call) {
        int httpPort = call.getInt("httpPort", 8090);
        int wsPort   = call.getInt("wsPort",   8091);
        try {
            if (httpServer != null) { httpServer.stop(); httpServer = null; }
            if (wsServer   != null) { try { wsServer.stop(); } catch (Exception ignored) {} wsServer = null; }

            httpServer = new BibleCastHttpServer(getContext().getAssets(), httpPort);
            wsServer   = new BibleCastWsServer(wsPort, new BibleCastWsServer.Listener() {
                @Override public void onMessage(String message) { onWsMessage(message); }
                @Override public void onClientsChanged(String clientsJson) { onClients(clientsJson); }
            });
            wsServer.start();

            // Service au premier plan : Android ne coupe plus le serveur écran éteint
            BibleCastService.start(getContext(), "Diffusion vers les écrans TV active");

            // Restaurer les vidéos de fond depuis SharedPreferences
            restoreBgVideos();

            // Broadcaster UDP multi-interfaces (WiFi + hotspot)
            startUdpBroadcast(httpPort, wsPort);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("httpPort", httpPort);
            result.put("wsPort", wsPort);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Échec démarrage serveur: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        try {
            stopUdpBroadcast();
            BibleCastService.stop(getContext());
            if (httpServer != null) { httpServer.clearVideo(); httpServer.stop(); httpServer = null; }
            if (wsServer   != null) { try { wsServer.stop(); } catch (Exception ignored) {} wsServer = null; }
            call.resolve();
        } catch (Exception e) {
            call.reject("Échec arrêt serveur: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getLocalIP(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ip", resolveLocalIP());
        call.resolve(result);
    }

    /** Mémorise l'état complet que chaque TV reçoit à sa (re)connexion. */
    @PluginMethod
    public void setState(PluginCall call) {
        String state = call.getString("state", "");
        if (wsServer != null && state != null && !state.isEmpty()) {
            wsServer.setStateMessage(state);
        }
        call.resolve();
    }

    /** Liste des TV actuellement connectées. */
    @PluginMethod
    public void getClients(PluginCall call) {
        JSObject res = new JSObject();
        try {
            res.put("clients", new JSArray(wsServer != null ? wsServer.clientsJson() : "[]"));
        } catch (Exception e) {
            res.put("clients", new JSArray());
        }
        call.resolve(res);
    }

    @PluginMethod
    public void sendWsMessage(PluginCall call) {
        String message = call.getString("message", "");
        if (wsServer != null && message != null && !message.isEmpty()) {
            wsServer.broadcastMessage(message);
        }
        call.resolve();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Vidéo locale → streaming HTTP
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Ouvre le sélecteur de fichiers système Android pour choisir une vidéo.
     * Sur Android 13+ (API 33), utilise ACTION_OPEN_DOCUMENT avec type video/*.
     * La permission persistante est prise pour accéder au fichier après redémarrage.
     */
    @PluginMethod
    public void openVideoPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        startActivityForResult(call, intent, "videoPickerResult");
    }

    @ActivityCallback
    private void videoPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            if (uri == null) { call.reject("URI nulle"); return; }

            // Droits persistants pour lire le fichier
            try {
                getActivity().getContentResolver().takePersistableUriPermission(
                        uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) { }

            // Infos du fichier via ContentResolver
            ContentResolver cr = getActivity().getContentResolver();
            long   fileSize = 0;
            String fileName = "video.mp4";
            String mimeType = cr.getType(uri);
            if (mimeType == null) mimeType = "video/mp4";

            try (Cursor cursor = cr.query(uri,
                    new String[]{ OpenableColumns.SIZE, OpenableColumns.DISPLAY_NAME },
                    null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                    int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) fileSize = cursor.getLong(sizeIdx);
                    if (nameIdx >= 0 && !cursor.isNull(nameIdx)) fileName = cursor.getString(nameIdx);
                }
            } catch (Exception ignored) { }

            // Fallback taille : ParcelFileDescriptor.getStatSize() (plus fiable)
            if (fileSize <= 0) {
                try (android.os.ParcelFileDescriptor pfd = cr.openFileDescriptor(uri, "r")) {
                    if (pfd != null) fileSize = Math.max(0, pfd.getStatSize());
                } catch (Exception ignored) { }
            }

            // Enregistre dans le serveur HTTP
            if (httpServer != null) {
                httpServer.setVideo(cr, uri, fileSize, mimeType);
            }

            String localIp  = resolveLocalIP();
            String videoUrl = "http://" + localIp + ":8090/video/stream";

            android.util.Log.d("BibleCastVideo",
                    "Vidéo prête: " + fileName + " (" + fileSize + " octets) → " + videoUrl);

            JSObject res = new JSObject();
            res.put("videoUrl",  videoUrl);
            res.put("fileName",  fileName);
            res.put("fileSize",  fileSize);
            res.put("mimeType",  mimeType);
            call.resolve(res);
        } else {
            call.reject("Sélection annulée");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Recherche vocale (reconnaissance Android, hors ligne si le pack français est installé)
    // ─────────────────────────────────────────────────────────────────────
    @PluginMethod
    public void listen(PluginCall call) {
        Intent intent = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Dites la référence, par ex. « Jean 3 verset 16 »");
        try {
            startActivityForResult(call, intent, "listenResult");
        } catch (Exception e) {
            call.reject("Reconnaissance vocale indisponible sur cette tablette");
        }
    }

    @ActivityCallback
    private void listenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSArray arr = new JSArray();
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            java.util.ArrayList<String> list = result.getData()
                    .getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
            if (list != null) for (String s : list) arr.put(s);
        }
        JSObject res = new JSObject();
        res.put("results", arr);
        call.resolve(res);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Écoute de la prédication (Vosk hors ligne) — voir SermonListener
    // ─────────────────────────────────────────────────────────────────────
    private SermonListener sermon;

    @PluginMethod
    public void sermonStart(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "sermonPermission");
            return;
        }
        doSermonStart(call);
    }

    @PermissionCallback
    private void sermonPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) doSermonStart(call);
        else call.reject("Autorisez le micro pour l'écoute de la prédication");
    }

    private void doSermonStart(PluginCall call) {
        if (sermon == null) {
            sermon = new SermonListener(getContext(), new SermonListener.Callback() {
                @Override public void onText(String text, boolean partial) {
                    JSObject e = new JSObject(); e.put("text", text); e.put("partial", partial);
                    notifyListeners("sermonText", e);
                }
                @Override public void onLevel(float level) {
                    JSObject e = new JSObject(); e.put("level", level);
                    notifyListeners("sermonLevel", e);
                }
                @Override public void onStatus(String state, String device, String error) {
                    JSObject e = new JSObject(); e.put("state", state);
                    if (device != null) e.put("device", device);
                    if (error != null) e.put("error", error);
                    notifyListeners("sermonStatus", e);
                }
            });
        }
        sermon.start();
        call.resolve();
    }

    @PluginMethod
    public void sermonStop(PluginCall call) {
        if (sermon != null) sermon.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (sermon != null) sermon.stop();
        super.handleOnDestroy();
    }

    /** Supprime la vidéo courante du serveur HTTP. */
    @PluginMethod
    public void clearVideo(PluginCall call) {
        if (httpServer != null) httpServer.clearVideo();
        android.util.Log.d("BibleCastVideo", "Vidéo effacée du serveur HTTP");
        call.resolve();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Galerie vidéos de fond (bg slots 0–4)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Ouvre le sélecteur de fichiers pour choisir une vidéo de fond.
     * Paramètre JS attendu : slot (int, 0–4).
     */
    @PluginMethod
    public void openBgVideoPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        startActivityForResult(call, intent, "bgVideoPickerResult");
    }

    @ActivityCallback
    private void bgVideoPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        int slot = call.getInt("slot", 0);
        if (slot < 0 || slot >= BGVIDEO_SLOTS) slot = 0;

        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            if (uri == null) { call.reject("URI nulle"); return; }

            // Droits persistants
            try {
                getActivity().getContentResolver().takePersistableUriPermission(
                        uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) { }

            ContentResolver cr = getActivity().getContentResolver();
            long   fileSize = 0;
            String fileName = "video.mp4";
            String mimeType = cr.getType(uri);
            if (mimeType == null) mimeType = "video/mp4";

            try (Cursor cursor = cr.query(uri,
                    new String[]{ OpenableColumns.SIZE, OpenableColumns.DISPLAY_NAME },
                    null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                    int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) fileSize = cursor.getLong(sizeIdx);
                    if (nameIdx >= 0 && !cursor.isNull(nameIdx)) fileName = cursor.getString(nameIdx);
                }
            } catch (Exception ignored) { }

            if (fileSize <= 0) {
                try (android.os.ParcelFileDescriptor pfd = cr.openFileDescriptor(uri, "r")) {
                    if (pfd != null) fileSize = Math.max(0, pfd.getStatSize());
                } catch (Exception ignored) { }
            }

            // Enregistre dans le serveur HTTP
            if (httpServer != null) {
                httpServer.setBgVideo(slot, cr, uri, fileSize, mimeType);
            }

            // Persiste l'URI + métadonnées dans SharedPreferences
            SharedPreferences prefs = getContext().getSharedPreferences(BGVIDEO_PREFS, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString("uri_"  + slot, uri.toString())
                    .putString("name_" + slot, fileName)
                    .putString("mime_" + slot, mimeType)
                    .apply();

            String localIp  = resolveLocalIP();
            String videoUrl = "http://" + localIp + ":8090/video/bg/" + slot;

            android.util.Log.d("BibleCastBgVideo",
                    "Slot " + slot + " : " + fileName + " → " + videoUrl);

            JSObject res = new JSObject();
            res.put("videoUrl", videoUrl);
            res.put("fileName", fileName);
            res.put("fileSize", fileSize);
            res.put("mimeType", mimeType);
            res.put("slot",     slot);
            call.resolve(res);
        } else {
            call.reject("Sélection annulée");
        }
    }

    /** Efface un slot de vidéo de fond. */
    @PluginMethod
    public void clearBgVideo(PluginCall call) {
        int slot = call.getInt("slot", 0);
        if (httpServer != null) httpServer.clearBgVideo(slot);
        SharedPreferences prefs = getContext().getSharedPreferences(BGVIDEO_PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .remove("uri_"  + slot)
                .remove("name_" + slot)
                .remove("mime_" + slot)
                .apply();
        android.util.Log.d("BibleCastBgVideo", "Slot " + slot + " effacé");
        call.resolve();
    }

    /** Retourne la liste de toutes les vidéos de fond enregistrées. */
    @PluginMethod
    public void listBgVideos(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(BGVIDEO_PREFS, Context.MODE_PRIVATE);
        String localIp = resolveLocalIP();
        JSArray arr = new JSArray();

        for (int i = 0; i < BGVIDEO_SLOTS; i++) {
            String uriStr = prefs.getString("uri_" + i, null);
            if (uriStr == null) continue;
            String fileName = prefs.getString("name_" + i, "video.mp4");
            String videoUrl = "http://" + localIp + ":8090/video/bg/" + i;

            JSObject item = new JSObject();
            item.put("slot",     i);
            item.put("fileName", fileName);
            item.put("videoUrl", videoUrl);
            arr.put(item);
        }

        JSObject res = new JSObject();
        res.put("videos", arr);
        call.resolve(res);
    }

    // ─────────────────────────────────────────────────────────────────────

    /** Restaure les URIs de vidéo de fond depuis SharedPreferences au démarrage. */
    private void restoreBgVideos() {
        SharedPreferences prefs = getContext().getSharedPreferences(BGVIDEO_PREFS, Context.MODE_PRIVATE);
        ContentResolver cr = getContext().getContentResolver();

        for (int i = 0; i < BGVIDEO_SLOTS; i++) {
            String uriStr = prefs.getString("uri_" + i, null);
            if (uriStr == null) continue;
            try {
                Uri bgUri = Uri.parse(uriStr);
                try {
                    cr.takePersistableUriPermission(bgUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
                String mime = prefs.getString("mime_" + i, "video/mp4");
                httpServer.setBgVideo(i, cr, bgUri, 0, mime);
                android.util.Log.d("BibleCastBgVideo", "Slot " + i + " restauré : " + uriStr);
            } catch (Exception e) {
                android.util.Log.w("BibleCastBgVideo",
                        "Restauration slot " + i + " échouée : " + e.getMessage());
                prefs.edit().remove("uri_" + i).remove("name_" + i).remove("mime_" + i).apply();
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────

    private void onWsMessage(String message) {
        JSObject event = new JSObject();
        event.put("message", message);
        notifyListeners("wsMessage", event);
    }

    private void onClients(String clientsJson) {
        JSObject event = new JSObject();
        try { event.put("clients", new JSArray(clientsJson)); }
        catch (Exception e) { event.put("clients", new JSArray()); }
        notifyListeners("clients", event);
        int n = 0;
        try { n = new JSArray(clientsJson).length(); } catch (Exception ignored) { }
        BibleCastService.update(getContext(), n == 0
                ? "Diffusion active — aucune TV connectée"
                : "Diffusion active — " + n + (n > 1 ? " TV connectées" : " TV connectée"));
    }

    /** Identifiant stable de cette tablette : les TV s'appairent avec lui. */
    private String getDeviceId() {
        SharedPreferences prefs = getContext().getSharedPreferences("BibleCastServer", Context.MODE_PRIVATE);
        String id = prefs.getString("deviceId", null);
        if (id == null || id.isEmpty()) {
            id = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            prefs.edit().putString("deviceId", id).apply();
        }
        return id;
    }

    // ─────────────────────────────────────────────────────────────────────
    // UDP broadcaster multi-interfaces — WiFi + hotspot AP couverts
    // ─────────────────────────────────────────────────────────────────────
    private void startUdpBroadcast(final int httpPort, final int wsPort) {
        stopUdpBroadcast();
        broadcastRunning = true;
        final String deviceId = getDeviceId();

        broadcastThread = new Thread(() -> {
            DatagramSocket socket = null;
            try {
                socket = new DatagramSocket();
                socket.setBroadcast(true);
                broadcastSocket = socket;

                android.util.Log.d("BibleCastBroadcast",
                        "Broadcaster multi-interfaces démarré (port " + UDP_DISCOVERY_PORT + ")");

                while (broadcastRunning && !Thread.currentThread().isInterrupted()) {
                    sendOnAllInterfaces(socket, httpPort, wsPort, deviceId);
                    Thread.sleep(2000);
                }
            } catch (InterruptedException ignored) {
            } catch (Exception e) {
                android.util.Log.w("BibleCastBroadcast", "Broadcaster erreur: " + e.getMessage());
            } finally {
                if (socket != null && !socket.isClosed()) socket.close();
            }
        });
        broadcastThread.setDaemon(true);
        broadcastThread.setName("biblecast-udp-broadcaster");
        broadcastThread.start();
    }

    private void sendOnAllInterfaces(DatagramSocket socket, int httpPort, int wsPort, String deviceId) {
        try {
            InetAddress limitedBcast = InetAddress.getByName("255.255.255.255");
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();

            while (ifaces != null && ifaces.hasMoreElements()) {
                NetworkInterface iface = ifaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;

                String name = iface.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni")
                        || name.startsWith("ppp") || name.startsWith("v4-")) continue;

                for (InterfaceAddress ifAddr : iface.getInterfaceAddresses()) {
                    InetAddress addr = ifAddr.getAddress();
                    if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;

                    InetAddress directed = ifAddr.getBroadcast();
                    if (directed == null) continue;

                    String ip = addr.getHostAddress();
                    if (!isPrivateIp(ip)) continue;

                    // Format : BIBLECAST_ANNOUNCE:{ip}:{http}:{ws}:{deviceId}
                    // (les anciennes versions de l'app TV ignorent le 4e champ)
                    byte[] data = (UDP_PREFIX + ip + ":" + httpPort + ":" + wsPort + ":" + deviceId)
                            .getBytes("UTF-8");

                    socket.send(new DatagramPacket(data, data.length,
                            directed, UDP_DISCOVERY_PORT));
                    socket.send(new DatagramPacket(data, data.length,
                            limitedBcast, UDP_DISCOVERY_PORT));

                    android.util.Log.v("BibleCastBroadcast",
                            "Broadcast [" + name + "] " + ip + " → " + directed);
                }
            }
        } catch (Exception e) {
            android.util.Log.w("BibleCastBroadcast",
                    "sendOnAllInterfaces erreur: " + e.getMessage());
        }
    }

    private boolean isPrivateIp(String ip) {
        return ip.startsWith("192.168.")
            || ip.startsWith("10.")
            || ip.matches("172\\.(1[6-9]|2\\d|3[01])\\..*");
    }

    private void stopUdpBroadcast() {
        broadcastRunning = false;
        if (broadcastThread != null) { broadcastThread.interrupt(); broadcastThread = null; }
        if (broadcastSocket != null && !broadcastSocket.isClosed()) {
            broadcastSocket.close();
            broadcastSocket = null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Résolution IP locale
    // ─────────────────────────────────────────────────────────────────────
    private String resolveLocalIP() {
        try {
            ConnectivityManager cm = (ConnectivityManager)
                    getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                Network activeNetwork = cm.getActiveNetwork();
                if (activeNetwork != null) {
                    LinkProperties props = cm.getLinkProperties(activeNetwork);
                    if (props != null) {
                        for (LinkAddress linkAddr : props.getLinkAddresses()) {
                            InetAddress addr = linkAddr.getAddress();
                            if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                                String ip = addr.getHostAddress();
                                if (ip != null && !ip.isEmpty() && !ip.startsWith("127.")) {
                                    return ip;
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) { }

        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            String wifiIp = null, privateIp = null, fallback = null;

            while (ifaces != null && ifaces.hasMoreElements()) {
                NetworkInterface iface = ifaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;
                String name = iface.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("ppp")) continue;

                Enumeration<InetAddress> addrs = iface.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;
                    String ip = addr.getHostAddress();
                    if (ip == null || ip.isEmpty() || ip.startsWith("127.") || ip.startsWith("0.")) continue;

                    boolean isWifi    = name.startsWith("wlan") || name.startsWith("swlan")
                                     || name.startsWith("ap")   || name.startsWith("eth");
                    boolean isPrivate = ip.startsWith("192.168.") || ip.startsWith("10.")
                                     || ip.matches("172\\.(1[6-9]|2\\d|3[01])\\..*");

                    if (isWifi && wifiIp == null)           wifiIp    = ip;
                    else if (isPrivate && privateIp == null) privateIp = ip;
                    else if (fallback == null)               fallback  = ip;
                }
            }

            if (wifiIp    != null) return wifiIp;
            if (privateIp != null) return privateIp;
            if (fallback  != null) return fallback;
        } catch (Exception ignored) { }

        return "127.0.0.1";
    }
}
