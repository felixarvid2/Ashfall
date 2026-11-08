package se.felixarvid.ashfall;

import android.content.Context;
import android.webkit.JavascriptInterface;

/** window.AshfallAndroid: the game's calls into the host. Runs on a WebView bridge thread. */
final class AshfallBridge {
    private final Haptics haptics;

    AshfallBridge(Context ctx) {
        this.haptics = new Haptics(ctx.getApplicationContext());
    }

    @JavascriptInterface
    public String platform() {
        return "android";
    }

    @JavascriptInterface
    public boolean secondScreen() {
        return Host.isPanelUp();
    }

    @JavascriptInterface
    public void rumble(double strong, double weak, double ms) {
        try {
            haptics.rumble(strong, weak, ms);
        } catch (Throwable ignored) {
        }
    }

    /** Back with nothing open, pressed twice (B10): the game has saved, so the app can close. */
    @JavascriptInterface
    public void quit() {
        try {
            Host.quit();
        } catch (Throwable ignored) {
        }
    }

    @JavascriptInterface
    public void panelState(String json) {
        try {
            Host.panelState(json);
        } catch (Throwable ignored) {
        }
    }
}
