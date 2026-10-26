package se.felixarvid.ashfall;

import android.content.Context;
import android.webkit.WebView;

/** The bottom-screen page: assets/panel/index.html in its own WebView, with window.AshfallPanel. */
final class PanelWebView {
    private PanelWebView() {
    }

    /** Creates, registers with {@link Host} and starts loading the panel page. Throws if no WebView can be made. */
    @SuppressWarnings("JavascriptInterface")
    static WebView create(Context ctx) {
        final WebView[] self = new WebView[1];
        WebView web = HostWebView.create(ctx, new HostWebView.Callbacks() {
            @Override
            public void onPageFinished() {
                Host.pushPanelState();
            }

            @Override
            public void onRenderGone() {
                Host.clearPanel(self[0]);
            }
        });
        self[0] = web;
        web.addJavascriptInterface(new PanelBridge(), "AshfallPanel");
        Host.setPanel(web);
        web.loadUrl(Host.PANEL_URL);
        return web;
    }

    static void release(WebView web) {
        if (web == null) return;
        Host.clearPanel(web);
        try {
            web.destroy();
        } catch (RuntimeException ignored) {
        }
    }
}
