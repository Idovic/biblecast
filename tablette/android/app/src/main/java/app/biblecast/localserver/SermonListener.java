package app.biblecast.localserver;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Écoute de la prédication, entièrement hors ligne (Vosk, modèle français léger).
 * Le son vient du micro USB (récepteur DJI branché), sinon du micro Bluetooth, sinon de la tablette.
 * Rien n'est enregistré : le son est analysé au fil de l'eau puis oublié.
 */
public class SermonListener {
    public interface Callback {
        void onText(String text, boolean partial);
        void onLevel(float level);
        void onStatus(String state, String device, String error);
    }

    private static final String TAG = "BibleCastSermon";
    /** Dossier du modèle dans les assets de l'APK (android/app/src/main/assets/vosk-model-fr) */
    private static final String MODEL_ASSET = "vosk-model-fr";
    private static final int RATE = 16000;
    private static Model model;

    private final Context ctx;
    private final Callback cb;
    private Thread thread;
    private volatile boolean running = false;
    private AudioManager am;
    private boolean scoStarted = false;
    private boolean commDeviceSet = false;

    public SermonListener(Context ctx, Callback cb) {
        this.ctx = ctx.getApplicationContext();
        this.cb = cb;
        this.am = (AudioManager) this.ctx.getSystemService(Context.AUDIO_SERVICE);
    }

    public boolean isRunning() { return running; }

    public synchronized void start() {
        if (running) return;
        running = true;
        thread = new Thread(this::run, "BibleCast-Sermon");
        thread.start();
    }

    public synchronized void stop() {
        running = false;
    }

    private void run() {
        AudioRecord rec = null;
        Recognizer rz = null;
        try {
            cb.onStatus("loading", null, null);
            if (model == null) {
                File dir = unpackModel();
                model = new Model(dir.getAbsolutePath());
            }
            AudioDeviceInfo dev = pickInput();
            String devName = deviceName(dev);
            if (dev != null && dev.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) startBluetooth();

            int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, RATE));
            if (dev != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) rec.setPreferredDevice(dev);
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("Micro indisponible");

            rz = new Recognizer(model, (float) RATE);
            rec.startRecording();
            cb.onStatus("listening", devName, null);

            short[] buf = new short[RATE / 10]; // 100 ms
            long lastLevel = 0;
            String lastPartial = "";
            while (running) {
                int n = rec.read(buf, 0, buf.length);
                if (n <= 0) continue;
                long now = System.currentTimeMillis();
                if (now - lastLevel > 200) {
                    double sum = 0;
                    for (int i = 0; i < n; i++) sum += (double) buf[i] * buf[i];
                    float rms = (float) (Math.sqrt(sum / n) / 32768.0);
                    cb.onLevel(Math.min(1f, rms * 5f));
                    lastLevel = now;
                }
                if (rz.acceptWaveForm(buf, n)) {
                    String t = field(rz.getResult(), "text");
                    if (!t.isEmpty()) cb.onText(t, false);
                    lastPartial = "";
                } else {
                    String p = field(rz.getPartialResult(), "partial");
                    if (!p.isEmpty() && !p.equals(lastPartial)) { lastPartial = p; cb.onText(p, true); }
                }
            }
            String f = field(rz.getFinalResult(), "text");
            if (!f.isEmpty()) cb.onText(f, false);
        } catch (Throwable e) {
            Log.e(TAG, "écoute", e);
            String msg = e.getMessage() != null ? e.getMessage() : e.toString();
            if (msg.contains(MODEL_ASSET)) msg = "Modèle de voix français absent de l'application";
            cb.onStatus("error", null, msg);
        } finally {
            try { if (rec != null) { rec.stop(); rec.release(); } } catch (Exception ignored) {}
            try { if (rz != null) rz.close(); } catch (Exception ignored) {}
            stopBluetooth();
            running = false;
            cb.onStatus("stopped", null, null);
        }
    }

    /** Micro préféré : USB (récepteur sans fil), puis Bluetooth, puis casque filaire, sinon la tablette */
    private AudioDeviceInfo pickInput() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        AudioDeviceInfo usb = null, bt = null, wired = null;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_HEADSET) usb = d;
            else if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) bt = d;
            else if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET) wired = d;
        }
        if (usb != null) return usb;
        if (bt != null) return bt;
        return wired;
    }

    private String deviceName(AudioDeviceInfo d) {
        if (d == null) return "interne";
        int t = d.getType();
        if (t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_HEADSET) return "usb";
        if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return "bluetooth";
        return "interne";
    }

    /** Un micro Bluetooth ne transmet la voix qu'en mode « mains libres » (SCO) */
    private void startBluetooth() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) { commDeviceSet = am.setCommunicationDevice(d); break; }
                }
            } else {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
                am.startBluetoothSco();
                am.setBluetoothScoOn(true);
                scoStarted = true;
                Thread.sleep(1500); // le temps que la liaison s'établisse
            }
        } catch (Exception e) { Log.w(TAG, "bluetooth", e); }
    }

    private void stopBluetooth() {
        try {
            if (commDeviceSet && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.clearCommunicationDevice();
            if (scoStarted) { am.setBluetoothScoOn(false); am.stopBluetoothSco(); am.setMode(AudioManager.MODE_NORMAL); }
        } catch (Exception ignored) {}
        commDeviceSet = false; scoStarted = false;
    }

    private static String field(String json, String key) {
        try { return new JSONObject(json).optString(key, "").trim(); } catch (Exception e) { return ""; }
    }

    /** Copie le modèle des assets vers la mémoire de l'app (une seule fois par version) */
    private File unpackModel() throws Exception {
        File dest = new File(ctx.getFilesDir(), MODEL_ASSET);
        File marker = new File(dest, ".biblecast-ok");
        long version = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).lastUpdateTime;
        if (marker.exists() && readLong(marker) == version) return dest;
        AssetManager assets = ctx.getAssets();
        String[] top = assets.list(MODEL_ASSET);
        if (top == null || top.length == 0) throw new IllegalStateException(MODEL_ASSET + " manquant");
        copyDir(assets, MODEL_ASSET, dest);
        try (OutputStream o = new FileOutputStream(marker)) { o.write(String.valueOf(version).getBytes()); }
        return dest;
    }

    private static long readLong(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            byte[] b = new byte[32]; int n = in.read(b);
            return Long.parseLong(new String(b, 0, Math.max(0, n)).trim());
        } catch (Exception e) { return -1; }
    }

    private static void copyDir(AssetManager assets, String path, File dest) throws Exception {
        String[] list = assets.list(path);
        if (list == null || list.length == 0) {
            dest.getParentFile().mkdirs();
            try (InputStream in = assets.open(path); OutputStream out = new FileOutputStream(dest)) {
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
            }
            return;
        }
        dest.mkdirs();
        for (String name : list) copyDir(assets, path + "/" + name, new File(dest, name));
    }
}
