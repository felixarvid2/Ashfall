package se.felixarvid.ashfall;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.WebView;

/** Fallback host for the bottom-screen panel when a Presentation cannot be shown on the second display. */
public final class SecondaryActivity extends Activity {
    private static SecondaryActivity current;
    private WebView web;

    static SecondaryActivity current() {
        return current;
    }

    static void finishCurrent() {
        SecondaryActivity a = current;
        if (a != null) a.finish();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        try {
            web = PanelWebView.create(this);
            setContentView(web);
            Immersive.apply(getWindow());
            Host.setSecondaryUp(true);
        } catch (RuntimeException e) {
            finish(); // no panel; the game on the top screen is unaffected
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) PadRouter.releaseAll();
        else Immersive.apply(getWindow());
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (PadRouter.dispatchKey(event)) return true;
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (PadRouter.dispatchMotion(ev)) return true;
        return super.dispatchGenericMotionEvent(ev);
    }

    @Override
    public void onBackPressed() {
        // swallowed
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        Host.setSecondaryUp(false);
        PanelWebView.release(web);
        web = null;
        DualScreenManager.onSecondaryGone();
        super.onDestroy();
    }
}
