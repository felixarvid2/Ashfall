package se.felixarvid.ashfall;

import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Builds the two WebViews (game, panel): same settings, both served from the APK by {@link AssetServer}. */
final class HostWebView {
    private static final String TAG = "Ashfall";

    private HostWebView() {
    }

    /** Called on the main thread when the page has finished loading / the renderer died. */
    interface Callbacks {
        void onPageFinished();

        void onRenderGone();
    }

    @SuppressWarnings({"SetJavaScriptEnabled", "deprecation"})
    static WebView create(Context ctx, Callbacks cb) {
        WebView web = new WebView(ctx);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(false);

        final AssetServer server = new AssetServer(ctx.getApplicationContext().getAssets());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    return server.serve(request);
                } catch (RuntimeException e) {
                    Log.w(TAG, "asset request failed: " + request.getUrl(), e);
                    return null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // never navigate away from the game's own origin
                return !AssetServer.HOST.equals(request.getUrl().getHost());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (cb != null) cb.onPageFinished();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.w(TAG, "WebView renderer gone (crashed=" + detail.didCrash() + ")");
                if (cb != null) cb.onRenderGone();
                return true; // handled: the app process survives
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        return web;
    }
}
