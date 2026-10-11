// Keyboard, touch and gamepad merged into one analogue driving state (port of input.js).
// Uses the legacy Input Manager so the project needs no extra packages.
using UnityEngine;

namespace Downfall
{
    public sealed class DriveInput
    {
        public float throttle, brake, steer, handbrake, boost;
        public void Clear() { throttle = brake = steer = handbrake = boost = 0; }
    }

    public sealed class GameInput
    {
        // touch buttons (set by the on-screen controls)
        public float tLeft, tRight, tGas, tBrake, tBoost, tHand;
        public float steer;
        public readonly DriveInput state = new DriveInput();
        public string lastDevice;
        public bool isTouch;
        bool padCam, padStart;
        bool camPressed, escPressed;

        public GameInput()
        {
            isTouch = Application.isMobilePlatform;
            lastDevice = isTouch ? "touch" : "keyboard";
        }

        public static bool Down(params KeyCode[] codes) { foreach (var c in codes) if (Input.GetKey(c)) return true; return false; }
        public static bool Pressed(params KeyCode[] codes) { foreach (var c in codes) if (Input.GetKeyDown(c)) return true; return false; }

        // Camera switch (C or pad Y) and pause (Esc or pad Start), latched once per frame.
        public bool CameraPressed => camPressed || Input.GetKeyDown(KeyCode.C);
        public bool PausePressed => escPressed || Input.GetKeyDown(KeyCode.Escape);

        public void SetDevice(string d)
        {
            if (d == lastDevice) return;
            lastDevice = d;
            if (d == "touch") isTouch = true;
            if (d == "keyboard" || d == "mouse") isTouch = false;
        }

        static float Sgn(float v) => v > 0 ? 1 : v < 0 ? -1 : 0;

        public DriveInput Update(float dt)
        {
            camPressed = escPressed = false;
            float thr = Down(KeyCode.W, KeyCode.UpArrow) ? 1 : 0;
            float brk = Down(KeyCode.S, KeyCode.DownArrow) ? 1 : 0;
            float left = Down(KeyCode.A, KeyCode.LeftArrow) ? 1 : 0;
            float right = Down(KeyCode.D, KeyCode.RightArrow) ? 1 : 0;
            float hand = Down(KeyCode.Space) ? 1 : 0;
            float boost = Down(KeyCode.LeftShift, KeyCode.RightShift) ? 1 : 0;
            if (Input.anyKeyDown && !Input.GetMouseButtonDown(0) && Input.touchCount == 0) SetDevice("keyboard");
            if (Input.touchCount > 0) SetDevice("touch");
            thr = Mathf.Max(thr, tGas); brk = Mathf.Max(brk, tBrake); left = Mathf.Max(left, tLeft); right = Mathf.Max(right, tRight);
            hand = Mathf.Max(hand, tHand); boost = Mathf.Max(boost, tBoost);

            // gamepad: left stick, A = gas, B = handbrake, X = turbo, Y = camera, Start = pause
            float? analog = null;
            float ax = 0;
            try { ax = Input.GetAxisRaw("Horizontal"); } catch (System.Exception) { }
            bool keySteer = left > 0 || right > 0;
            if (!keySteer && Mathf.Abs(ax) > 0.12f && Input.GetJoystickNames().Length > 0) { analog = -ax; lastDevice = "gamepad"; }
            if (Input.GetKey(KeyCode.JoystickButton0)) { thr = 1; lastDevice = "gamepad"; }
            if (Input.GetKey(KeyCode.JoystickButton1)) hand = 1;
            if (Input.GetKey(KeyCode.JoystickButton2)) boost = 1;
            float lt = 0, rt = 0;
            try { rt = Input.GetAxisRaw("Downfall Gas"); lt = Input.GetAxisRaw("Downfall Brake"); } catch (System.Exception) { }
            if (rt > 0.05f || lt > 0.05f) lastDevice = "gamepad";
            thr = Mathf.Max(thr, rt); brk = Mathf.Max(brk, lt);
            bool y = Input.GetKey(KeyCode.JoystickButton3);
            if (y && !padCam) camPressed = true;
            padCam = y;
            bool st = Input.GetKey(KeyCode.JoystickButton7);
            if (st && !padStart) escPressed = true;
            padStart = st;

            // keyboard steering: quick ramp, faster return to centre
            float target = analog ?? (left - right);
            float rate = Sgn(target) != Sgn(steer) || target == 0 ? 7f : 3.6f;
            if (analog.HasValue) steer = target;
            else steer += Mathf.Clamp(target - steer, -rate * dt, rate * dt);
            var s = state;
            s.throttle = thr; s.brake = brk; s.steer = Mathf.Clamp(steer, -1, 1); s.handbrake = hand; s.boost = boost;
            return s;
        }
    }
}
