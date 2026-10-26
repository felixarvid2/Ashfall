package se.felixarvid.ashfall;

import android.webkit.JavascriptInterface;

/** window.AshfallPanel on the bottom-screen page: button presses go to the game's __ashfallCommand. */
final class PanelBridge {
    @JavascriptInterface
    public void command(String name) {
        try {
            Host.command(name);
        } catch (Throwable ignored) {
        }
    }
}
