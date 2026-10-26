package se.felixarvid.ashfall;

import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Process-wide glue between the game WebView (top screen), the panel WebView (bottom screen) and the bridges.
 * The WebView references are touched on the main thread only; everything that arrives from a JavaScript
 * bridge thread is posted there first.
 */
final class Host {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String GAME_URL = ORIGIN + "/index.html";
    static final String PANEL_URL = ORIGIN + "/panel/index.html";

    /** Commands the panel may send; the game's __ashfallCommand knows these (plus 'back' from the system). */
    private static final Set<String> COMMANDS = new HashSet<>(Arrays.asList(
            "back", "pause", "inventory", "character", "skills", "quests", "map", "potion", "flare", "mount", "pickup"));

    private static final Handler UI = new Handler(Looper.getMainLooper());
    private static WebView game;
    private static WebView panel;
    private static volatile boolean presentationUp;
    private static volatile boolean secondaryUp;
    private static volatile String lastPanelState;

    private Host() {
    }

    static void setGame(WebView w) {
        game = w;
    }

    static void setPanel(WebView w) {
        panel = w;
    }

    static void clearPanel(WebView w) {
        if (panel == w) panel = null;
    }

    static void setPresentationUp(boolean up) {
        presentationUp = up;
    }

    static void setSecondaryUp(boolean up) {
        secondaryUp = up;
    }

    /** True while a bottom-screen panel (Presentation or SecondaryActivity) is on a display. */
    static boolean isPanelUp() {
        return presentationUp || secondaryUp;
    }

    static void runOnUi(Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) r.run();
        else UI.post(r);
    }

    /** Runs a script in the game page; a missing function is ignored by the callers' own guards. */
    static void evalGame(String js) {
        runOnUi(() -> {
            WebView w = game;
            if (w == null) return;
            try {
                w.evaluateJavascript(js, null);
            } catch (RuntimeException ignored) {
            }
        });
    }

    /** Forwards a command to the game as __ashfallCommand(name); unknown names are dropped. */
    static void command(String name) {
        if (name == null || !COMMANDS.contains(name)) return;
        evalGame("window.__ashfallCommand&&window.__ashfallCommand(" + JSONObject.quote(name) + ")");
    }

    /** Stores the game's latest panel state and forwards it to the panel page if one is up. */
    static void panelState(String json) {
        if (json == null || json.length() > 4096) return;
        final String clean;
        try {
            clean = new JSONObject(json).toString(); // only a JSON object ever reaches the panel page
        } catch (Exception e) {
            return;
        }
        lastPanelState = clean;
        runOnUi(Host::pushPanelState);
    }

    /** Sends the last known state to the panel page (also called when the page has loaded). */
    static void pushPanelState() {
        WebView w = panel;
        String s = lastPanelState;
        if (w == null || s == null) return;
        try {
            w.evaluateJavascript("window.__panel&&window.__panel(" + s + ")", null);
        } catch (RuntimeException ignored) {
        }
    }
}
