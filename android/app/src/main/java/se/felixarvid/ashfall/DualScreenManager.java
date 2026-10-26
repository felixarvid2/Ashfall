package se.felixarvid.ashfall;

import android.app.Activity;
import android.app.ActivityOptions;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Display;

/**
 * Finds the second display and shows the control panel there. Reacts live to displays being added/removed.
 *
 * Order of attempts: Presentation -> (it cannot be shown) -> SecondaryActivity launched with
 * ActivityOptions.setLaunchDisplayId (thor-survivors needed this on the device). Every step fails quietly:
 * without a second display, or when both paths fail, the game simply runs on the top screen alone.
 */
final class DualScreenManager implements DisplayManager.DisplayListener {
    private static final String TAG = "Ashfall";
    private static volatile boolean activityLaunched;
    private static volatile int activityDisplayId = -1;

    private final Activity host;
    private final DisplayManager dm;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PanelPresentation presentation;
    private boolean started;

    DualScreenManager(Activity host) {
        this.host = host;
        this.dm = (DisplayManager) host.getSystemService(Activity.DISPLAY_SERVICE);
    }

    static void onSecondaryGone() {
        activityLaunched = false;
        activityDisplayId = -1;
    }

    void start() {
        if (started) return;
        started = true;
        try {
            dm.registerDisplayListener(this, handler);
        } catch (RuntimeException e) {
            Log.w(TAG, "display listener failed", e);
        }
        refresh();
    }

    void stop() {
        if (!started) return;
        started = false;
        try {
            dm.unregisterDisplayListener(this);
        } catch (RuntimeException ignored) {
        }
        teardown();
    }

    /** The display the panel should go to, or null when there is only one screen. */
    private Display findSecondary() {
        int defaultId = host.getDisplay() != null ? host.getDisplay().getDisplayId() : Display.DEFAULT_DISPLAY;
        for (Display d : dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (d.getDisplayId() != Display.DEFAULT_DISPLAY && d.getDisplayId() != defaultId && d.isValid()) return d;
        }
        for (Display d : dm.getDisplays()) {
            if (d.getDisplayId() != Display.DEFAULT_DISPLAY && d.getDisplayId() != defaultId && d.isValid()
                    && d.getState() != Display.STATE_OFF) {
                return d;
            }
        }
        return null;
    }

    void refresh() {
        if (!started) return;
        try {
            Display d = findSecondary();
            if (d == null) {
                teardown();
                return;
            }
            if (presentation != null) {
                if (presentation.isShowing() && presentation.getDisplay().getDisplayId() == d.getDisplayId()) return;
                teardown();
            }
            if (activityLaunched && activityDisplayId == d.getDisplayId() && SecondaryActivity.current() != null) return;
            if (activityLaunched && activityDisplayId != d.getDisplayId()) SecondaryActivity.finishCurrent();
            try {
                PanelPresentation p = new PanelPresentation(host, d);
                p.setOnDismissListener(dlg -> Host.setPresentationUp(false));
                p.show();
                presentation = p;
                Host.setPresentationUp(true);
            } catch (RuntimeException ex) { // InvalidDisplayException, IllegalStateException, SecurityException, WebView failure
                Log.w(TAG, "Presentation failed, falling back to SecondaryActivity", ex);
                discardPresentation();
                launchActivityOn(d);
            }
        } catch (Throwable t) {
            Log.w(TAG, "dual screen refresh failed", t);
        }
    }

    private void launchActivityOn(Display d) {
        try {
            Intent i = new Intent(host, SecondaryActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
            ActivityOptions opts = ActivityOptions.makeBasic();
            opts.setLaunchDisplayId(d.getDisplayId());
            activityLaunched = true;
            activityDisplayId = d.getDisplayId();
            host.startActivity(i, opts.toBundle());
        } catch (RuntimeException ex) {
            // Neither path works: the game stays playable on the top screen.
            Log.w(TAG, "SecondaryActivity failed", ex);
            activityLaunched = false;
            activityDisplayId = -1;
        }
    }

    private void discardPresentation() {
        Host.setPresentationUp(false);
        if (presentation != null) {
            try {
                presentation.dismiss();
            } catch (RuntimeException ignored) {
            }
            presentation = null;
        }
    }

    private void teardown() {
        discardPresentation();
        if (activityLaunched) {
            SecondaryActivity.finishCurrent();
            activityLaunched = false;
            activityDisplayId = -1;
        }
    }

    @Override
    public void onDisplayAdded(int displayId) {
        refresh();
    }

    @Override
    public void onDisplayRemoved(int displayId) {
        refresh();
    }

    @Override
    public void onDisplayChanged(int displayId) {
        refresh();
    }
}
