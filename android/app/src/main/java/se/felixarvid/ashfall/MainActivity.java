package se.felixarvid.ashfall;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;

/** Top screen: the Ashfall web build in a WebView, plus the controller router and the bottom-screen panel. */
public final class MainActivity extends Activity {
    private static final String TAG = "Ashfall";

    private WebView web;
    private PadRouter pad;
    private DualScreenManager dual;

    @Override
    @SuppressWarnings("JavascriptInterface")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect; debug builds only matter

        web = HostWebView.create(this, new HostWebView.Callbacks() {
            @Override
            public void onPageFinished() {
                // the game may have loaded after the controller connected
                if (pad != null) pad.resend();
            }

            @Override
            public void onRenderGone() {
                Log.w(TAG, "game renderer lost, recreating the activity");
                runOnUiThread(MainActivity.this::recreate);
            }
        });
        web.addJavascriptInterface(new AshfallBridge(this), "AshfallAndroid"); // before the page runs
        Host.setGame(web);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        Immersive.apply(getWindow());

        pad = new PadRouter(this);
        dual = new DualScreenManager(this);
        web.loadUrl(Host.GAME_URL);
    }

    @Override
    protected void onStart() {
        super.onStart();
        dual.start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Immersive.apply(getWindow());
        web.onResume();
        web.resumeTimers();
        pad.start();
        dual.refresh();
    }

    @Override
    protected void onPause() {
        pad.stop(); // releases held buttons and sticks
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onStop() {
        dual.stop();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        dual.stop();
        pad.destroy();
        Host.setGame(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) PadRouter.releaseAll();
        else Immersive.apply(getWindow());
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (PadRouter.dispatchKey(event)) return true; // controller: the WebView never sees it
        return super.dispatchKeyEvent(event);          // keyboard etc. still reaches the page
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (PadRouter.dispatchMotion(ev)) return true;
        return super.dispatchGenericMotionEvent(ev);
    }

    /** System Back is a game command (close the top panel, else open the pause menu); it never leaves the app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        Host.command("back");
    }
}
