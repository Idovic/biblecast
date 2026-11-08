package app.biblecast.localserver;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Serveur WebSocket local (port 8091).
 *
 *  - Diffuse les commandes de la tablette vers toutes les TV.
 *  - Garde en mémoire le dernier « état complet » (message type=state) et
 *    l'envoie à chaque TV dès sa (re)connexion : thème, réglages, contenu en cours.
 *  - Reçoit les messages des TV (hello, tv-status, request-next…) et les
 *    transmet à l'app tablette. Ils ne sont plus relayés aux autres TV.
 *  - Tient la liste des TV connectées.
 */
public class BibleCastWsServer extends WebSocketServer {

    public interface Listener {
        void onMessage(String message);
        void onClientsChanged(String clientsJson);
    }

    private final Listener listener;
    private final Map<WebSocket, JSONObject> clients = new ConcurrentHashMap<>();
    private volatile String stateMessage = null;

    public BibleCastWsServer(int port, Listener listener) {
        super(new InetSocketAddress(port));
        this.listener = listener;
        setReuseAddr(true);
        // Détecte une TV éteinte ou déconnectée en ~10 s au lieu de 60 s
        setConnectionLostTimeout(10);
    }

    /** Mémorise l'état complet envoyé à chaque nouvelle connexion. */
    public void setStateMessage(String message) {
        this.stateMessage = message;
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        JSONObject info = new JSONObject();
        try {
            InetSocketAddress addr = conn.getRemoteSocketAddress();
            if (addr != null && addr.getAddress() != null) {
                info.put("address", addr.getAddress().getHostAddress());
            }
            info.put("since", System.currentTimeMillis());
        } catch (JSONException ignored) { }
        clients.put(conn, info);
        sendState(conn);
        notifyClients();
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        clients.remove(conn);
        notifyClients();
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        try {
            JSONObject msg = new JSONObject(message);
            if ("hello".equals(msg.optString("type"))) {
                JSONObject info = clients.get(conn);
                if (info == null) info = new JSONObject();
                info.put("tvId", msg.optString("tvId", ""));
                info.put("name", msg.optString("name", ""));
                info.put("nativeVideo", msg.optBoolean("nativeVideo", false));
                info.put("appVersion", msg.optString("appVersion", ""));
                clients.put(conn, info);
                sendState(conn);
                notifyClients();
            }
        } catch (JSONException ignored) { }
        if (listener != null) listener.onMessage(message);
    }

    @Override
    public void onError(WebSocket conn, Exception ex) { }

    @Override
    public void onStart() { }

    public void broadcastMessage(String message) {
        for (WebSocket client : clients.keySet()) {
            if (client.isOpen()) {
                try { client.send(message); } catch (Exception ignored) { }
            }
        }
    }

    public String clientsJson() {
        JSONArray arr = new JSONArray();
        for (Map.Entry<WebSocket, JSONObject> e : clients.entrySet()) {
            if (e.getKey().isOpen()) arr.put(e.getValue());
        }
        return arr.toString();
    }

    private void sendState(WebSocket conn) {
        String s = stateMessage;
        if (s != null && conn.isOpen()) {
            try { conn.send(s); } catch (Exception ignored) { }
        }
    }

    private void notifyClients() {
        if (listener != null) listener.onClientsChanged(clientsJson());
    }
}
