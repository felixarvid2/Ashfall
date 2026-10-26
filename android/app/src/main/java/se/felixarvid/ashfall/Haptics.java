package se.felixarvid.ashfall;

import android.content.Context;
import android.os.Build;
import android.os.CombinedVibration;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.InputDevice;

/** Rumble on the active controller's motors, falling back to the device vibrator. */
final class Haptics {
    static final int MAX_MS = 500;

    private final Context ctx;

    Haptics(Context ctx) {
        this.ctx = ctx;
    }

    void rumble(double strong, double weak, double msIn) {
        float s = clamp01(strong), w = clamp01(weak);
        if (s <= 0f && w <= 0f) return;
        long ms = (long) Math.max(1, Math.min(MAX_MS, Double.isNaN(msIn) ? 0 : msIn));
        if (ms <= 0) return;
        int deviceId = PadRouter.activeDeviceId();
        if (deviceId >= 0 && onController(deviceId, s, w, ms)) return;
        onDevice(Math.max(s, w), ms);
    }

    private boolean onController(int deviceId, float strong, float weak, long ms) {
        try {
            InputDevice dev = InputDevice.getDevice(deviceId);
            if (dev == null) return false;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = dev.getVibratorManager();
                int[] ids = vm.getVibratorIds();
                if (ids.length >= 2) {
                    // two motors: the first is the heavy (strong) one by convention
                    CombinedVibration.ParallelCombination c = CombinedVibration.startParallel();
                    boolean any = false;
                    float[] amps = {strong, weak};
                    for (int i = 0; i < ids.length && i < 2; i++) {
                        if (amps[i] <= 0f) continue;
                        c.addVibrator(ids[i], effect(vm.getVibrator(ids[i]), amps[i], ms));
                        any = true;
                    }
                    if (any) {
                        vm.vibrate(c.combine());
                        return true;
                    }
                    return false;
                }
                return vibrate(vm.getDefaultVibrator(), Math.max(strong, weak), ms);
            }
            @SuppressWarnings("deprecation") Vibrator v = dev.getVibrator();
            return vibrate(v, Math.max(strong, weak), ms);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private void onDevice(float amp, long ms) {
        try {
            Vibrator v;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm == null ? null : vm.getDefaultVibrator();
            } else {
                v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            vibrate(v, amp, ms);
        } catch (RuntimeException ignored) {
        }
    }

    private static boolean vibrate(Vibrator v, float amp, long ms) {
        if (v == null || !v.hasVibrator()) return false;
        v.vibrate(effect(v, amp, ms));
        return true;
    }

    private static VibrationEffect effect(Vibrator v, float amp, long ms) {
        if (v.hasAmplitudeControl()) {
            return VibrationEffect.createOneShot(ms, Math.max(1, Math.min(255, Math.round(amp * 255f))));
        }
        return VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE);
    }

    private static float clamp01(double v) {
        if (Double.isNaN(v)) return 0f;
        return (float) Math.max(0, Math.min(1, v));
    }
}
