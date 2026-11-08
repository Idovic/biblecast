package app.biblecast.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Démarrage automatique : ouvre BibleCast TV quand la TV s'allume.
 * Sur Android 10 et plus, il faut en plus autoriser l'app à « s'afficher
 * par-dessus les autres applications » (Paramètres → Applications → Accès spéciaux).
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            try {
                Intent i = new Intent(context, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                context.startActivity(i);
            } catch (Exception e) {
                Log.w("BibleCastTV", "Démarrage auto impossible : " + e.getMessage());
            }
        }
    }
}
