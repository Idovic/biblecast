package app.biblecast;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.biblecast.localserver.LocalServerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
