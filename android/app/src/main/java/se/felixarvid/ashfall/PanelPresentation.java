package se.felixarvid.ashfall;

import android.app.Presentation;
import android.content.Context;
import android.os.Bundle;
import android.view.Display;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.webkit.WebView;

/** The bottom-screen panel shown through android.app.Presentation. */
final class PanelPresentation extends Presentation {
    private WebView web;

    PanelPresentation(Context outer, Display display) {
        super(outer, display);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setCancelable(false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        web = PanelWebView.create(getContext());
        setContentView(web);
        Immersive.apply(getWindow());
    }

    @Override
    protected void onStop() {
        PanelWebView.release(web);
        web = null;
        super.onStop();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) PadRouter.releaseAll(); // key-up events are lost with focus
        else Immersive.apply(getWindow());
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (PadRouter.dispatchKey(event)) return true;
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) return true; // never let BACK dismiss the panel
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (PadRouter.dispatchMotion(ev)) return true;
        return super.dispatchGenericMotionEvent(ev);
    }

    @Override
    public void onBackPressed() {
        // swallowed: the panel is part of the game, not a dialog
    }
}
