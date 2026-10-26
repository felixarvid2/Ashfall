package se.felixarvid.ashfall;

import android.content.Context;
import android.hardware.input.InputManager;
import android.os.Handler;
import android.os.Looper;
import android.view.Choreographer;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Turns controller key and motion events into a standard-mapping gamepad state (4 axes, 17 buttons) and pushes
 * it to the game as window.__ashfallPad(...). Every window that can hold focus (game activity, Presentation,
 * SecondaryActivity) forwards its events here; controller events are consumed so the WebView never sees them,
 * keyboard and touch events pass through. Axis handling follows thor-survivors' InputRouter.
 *
 * Main thread only. Pushes are coalesced to one per frame; connect and disconnect are sent at once.
 */
final class PadRouter implements InputManager.InputDeviceListener {
    private static final int BUTTONS = 17;
    private static final float STICK_DEADZONE = 0.05f;
    private static final long HEARTBEAT_MS = 2000;

    // standard mapping indices
    private static final int B_A = 0, B_B = 1, B_X = 2, B_Y = 3, B_LB = 4, B_RB = 5, B_LT = 6, B_RT = 7,
            B_SELECT = 8, B_START = 9, B_L3 = 10, B_R3 = 11, B_UP = 12, B_DOWN = 13, B_LEFT = 14, B_RIGHT = 15,
            B_HOME = 16;

    private static PadRouter instance;
    private static volatile int activeDevice = -1;

    private final InputManager inputManager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<Integer> pads = new HashSet<>();
    private final boolean[] keys = new boolean[BUTTONS];
    private float lx, ly, rx, ry, lTrig, rTrig, hatX, hatY;
    private String name = "";

    private boolean pushScheduled;
    private boolean running;
    private boolean sentOnce;
    private boolean sentConnected;
    private String sentName = "";
    private final float[] sentAxes = new float[4];
    private final float[] sentButtons = new float[BUTTONS];

    private final Choreographer.FrameCallback frame = t -> {
        pushScheduled = false;
        push(false);
    };
    private final Runnable heartbeat = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            push(true); // idempotent; covers a game page that finished loading after the last change
            handler.postDelayed(this, HEARTBEAT_MS);
        }
    };

    PadRouter(Context ctx) {
        inputManager = (InputManager) ctx.getSystemService(Context.INPUT_SERVICE);
        instance = this;
    }

    // ---- lifecycle ---------------------------------------------------------------------------------------

    void start() {
        if (running) return;
        running = true;
        inputManager.registerInputDeviceListener(this, handler);
        rescan();
        push(true);
        handler.postDelayed(heartbeat, HEARTBEAT_MS);
    }

    void stop() {
        if (!running) return;
        running = false;
        inputManager.unregisterInputDeviceListener(this);
        handler.removeCallbacks(heartbeat);
        releaseInputs();
    }

    /** Sends the full state again (the game page has just loaded). */
    void resend() {
        if (running) push(true);
    }

    void destroy() {
        stop();
        if (instance == this) instance = null;
    }

    // ---- static entry points for every window --------------------------------------------------------------

    static boolean dispatchKey(KeyEvent e) {
        PadRouter p = instance;
        return p != null && p.onKey(e);
    }

    static boolean dispatchMotion(MotionEvent e) {
        PadRouter p = instance;
        return p != null && p.onMotion(e);
    }

    /** A window lost focus: key-up events are lost with it, so let go of everything. */
    static void releaseAll() {
        PadRouter p = instance;
        if (p != null) p.releaseInputs();
    }

    static int activeDeviceId() {
        return activeDevice;
    }

    // ---- events ------------------------------------------------------------------------------------------------

    private static boolean isPadSource(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    private static boolean isPadKey(KeyEvent e) {
        int code = e.getKeyCode();
        int src = e.getSource();
        if (isPadSource(src) || KeyEvent.isGamepadButton(code)) return true;
        // a d-pad that is not a keyboard (physical keyboards also report arrows)
        return (src & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD
                && (src & InputDevice.SOURCE_KEYBOARD) != InputDevice.SOURCE_KEYBOARD;
    }

    /** @return true if the event was a controller event and has been consumed. */
    boolean onKey(KeyEvent e) {
        int code = e.getKeyCode();
        if (code == KeyEvent.KEYCODE_BACK || !isPadKey(e)) return false; // Back goes to the activity
        int action = e.getAction();
        if (action != KeyEvent.ACTION_DOWN && action != KeyEvent.ACTION_UP) return true;
        noteDevice(e.getDeviceId());
        int b = buttonFor(code);
        if (b >= 0) {
            boolean down = action == KeyEvent.ACTION_DOWN;
            if (keys[b] != down) {
                keys[b] = down;
                schedulePush();
            }
        }
        return true;
    }

    private static int buttonFor(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_DPAD_CENTER: return B_A;
            case KeyEvent.KEYCODE_BUTTON_B: return B_B;
            case KeyEvent.KEYCODE_BUTTON_X: return B_X;
            case KeyEvent.KEYCODE_BUTTON_Y: return B_Y;
            case KeyEvent.KEYCODE_BUTTON_L1: return B_LB;
            case KeyEvent.KEYCODE_BUTTON_R1: return B_RB;
            case KeyEvent.KEYCODE_BUTTON_L2: return B_LT;
            case KeyEvent.KEYCODE_BUTTON_R2: return B_RT;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return B_SELECT;
            case KeyEvent.KEYCODE_BUTTON_START: return B_START;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return B_L3;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return B_R3;
            case KeyEvent.KEYCODE_DPAD_UP: return B_UP;
            case KeyEvent.KEYCODE_DPAD_DOWN: return B_DOWN;
            case KeyEvent.KEYCODE_DPAD_LEFT: return B_LEFT;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return B_RIGHT;
            case KeyEvent.KEYCODE_BUTTON_MODE: return B_HOME;
            default: return -1; // other gamepad buttons are swallowed but have no standard slot
        }
    }

    /** @return true if the event was a joystick movement and has been consumed. */
    boolean onMotion(MotionEvent e) {
        if ((e.getSource() & InputDevice.SOURCE_JOYSTICK) != InputDevice.SOURCE_JOYSTICK
                || e.getAction() != MotionEvent.ACTION_MOVE) {
            return false;
        }
        noteDevice(e.getDeviceId());
        lx = stick(e.getAxisValue(MotionEvent.AXIS_X));
        ly = stick(e.getAxisValue(MotionEvent.AXIS_Y));
        hatX = Math.abs(e.getAxisValue(MotionEvent.AXIS_HAT_X)) > 0.5f ? Math.signum(e.getAxisValue(MotionEvent.AXIS_HAT_X)) : 0f;
        hatY = Math.abs(e.getAxisValue(MotionEvent.AXIS_HAT_Y)) > 0.5f ? Math.signum(e.getAxisValue(MotionEvent.AXIS_HAT_Y)) : 0f;

        // right stick: Z / RZ on most pads, RX / RY on others
        float zx = e.getAxisValue(MotionEvent.AXIS_Z), zy = e.getAxisValue(MotionEvent.AXIS_RZ);
        if (Math.abs(zx) < 0.01f && Math.abs(zy) < 0.01f) {
            zx = e.getAxisValue(MotionEvent.AXIS_RX);
            zy = e.getAxisValue(MotionEvent.AXIS_RY);
        }
        rx = stick(zx);
        ry = stick(zy);

        // analog triggers (also reported as BRAKE / GAS on some pads)
        lTrig = trigger(Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE)));
        rTrig = trigger(Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS)));
        schedulePush();
        return true;
    }

    private static float stick(float v) {
        if (Math.abs(v) < STICK_DEADZONE) return 0f;
        return round2(Math.max(-1f, Math.min(1f, v)));
    }

    private static float trigger(float v) {
        return v < 0.02f ? 0f : round2(Math.min(1f, v));
    }

    private static float round2(float v) {
        return Math.round(v * 100f) / 100f;
    }

    private void releaseInputs() {
        boolean changed = lx != 0 || ly != 0 || rx != 0 || ry != 0 || lTrig != 0 || rTrig != 0 || hatX != 0 || hatY != 0;
        for (int i = 0; i < BUTTONS; i++) {
            if (keys[i]) changed = true;
            keys[i] = false;
        }
        lx = ly = rx = ry = lTrig = rTrig = hatX = hatY = 0f;
        if (changed && running) push(false);
    }

    // ---- devices -----------------------------------------------------------------------------------------------

    private void noteDevice(int id) {
        if (id < 0) return;
        activeDevice = id;
        if (pads.add(id)) { // a controller we had not listed (odd source flags): count it as connected
            refreshName();
            push(true);
        }
    }

    private static boolean isController(InputDevice d) {
        return d != null && isPadSource(d.getSources());
    }

    private void rescan() {
        pads.clear();
        for (int id : InputDevice.getDeviceIds()) {
            if (isController(InputDevice.getDevice(id))) pads.add(id);
        }
        if (!pads.contains(activeDevice)) activeDevice = pads.isEmpty() ? -1 : pads.iterator().next();
        refreshName();
    }

    private void refreshName() {
        InputDevice d = activeDevice >= 0 ? InputDevice.getDevice(activeDevice) : null;
        name = d != null && d.getName() != null ? d.getName() : (pads.isEmpty() ? "" : "Controller");
    }

    @Override
    public void onInputDeviceAdded(int deviceId) {
        rescan();
        push(true);
    }

    @Override
    public void onInputDeviceRemoved(int deviceId) {
        pads.remove(deviceId);
        if (activeDevice == deviceId) activeDevice = -1;
        rescan();
        if (pads.isEmpty()) releaseInputs();
        push(true);
    }

    @Override
    public void onInputDeviceChanged(int deviceId) {
        rescan();
        push(false);
    }

    // ---- push to the game ----------------------------------------------------------------------------------------

    private void schedulePush() {
        if (pushScheduled || !running) return;
        pushScheduled = true;
        Choreographer.getInstance().postFrameCallback(frame);
    }

    private float[] currentButtons() {
        float[] b = new float[BUTTONS];
        for (int i = 0; i < BUTTONS; i++) b[i] = keys[i] ? 1f : 0f;
        b[B_LT] = Math.max(b[B_LT], lTrig);
        b[B_RT] = Math.max(b[B_RT], rTrig);
        if (hatY < 0) b[B_UP] = 1f;
        if (hatY > 0) b[B_DOWN] = 1f;
        if (hatX < 0) b[B_LEFT] = 1f;
        if (hatX > 0) b[B_RIGHT] = 1f;
        return b;
    }

    private void push(boolean force) {
        boolean connected = !pads.isEmpty();
        float[] axes = {lx, ly, rx, ry};
        float[] buttons = currentButtons();
        boolean same = sentOnce && connected == sentConnected && name.equals(sentName)
                && java.util.Arrays.equals(axes, sentAxes) && java.util.Arrays.equals(buttons, sentButtons);
        if (same && !force) return;
        sentOnce = true;
        sentConnected = connected;
        sentName = name;
        System.arraycopy(axes, 0, sentAxes, 0, 4);
        System.arraycopy(buttons, 0, sentButtons, 0, BUTTONS);

        StringBuilder js = new StringBuilder(160);
        js.append("window.__ashfallPad&&window.__ashfallPad(").append(connected).append(',')
                .append(JSONObject.quote(connected ? name : "")).append(",[");
        for (int i = 0; i < 4; i++) js.append(i > 0 ? "," : "").append(num(axes[i]));
        js.append("],[");
        for (int i = 0; i < BUTTONS; i++) js.append(i > 0 ? "," : "").append(num(buttons[i]));
        js.append("])");
        Host.evalGame(js.toString());
    }

    private static String num(float v) {
        if (v == 0f) return "0"; // also folds -0
        if (v == 1f) return "1";
        if (v == -1f) return "-1";
        return Float.toString(v);
    }
}
