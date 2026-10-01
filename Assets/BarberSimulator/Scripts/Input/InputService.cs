using System;
using BarberSimulator.Save;
using UnityEngine;
using UnityEngine.InputSystem;

namespace BarberSimulator.Input
{
    /// <summary>
    /// Single entry point for player input. Gameplay asks for actions (Move, Look, Interact, Pause)
    /// and never checks keys or touches directly. Keyboard/mouse, gamepad and on-screen touch
    /// controls all feed the same actions, so desktop and mobile share one gameplay code path.
    /// </summary>
    public sealed class InputService : IDisposable
    {
        private const float MouseDegreesPerPixel = 0.075f;
        private const float TouchDegreesPerScreenHeight = 160f;
        private const float GamepadDegreesPerSecond = 150f;

        private readonly InputActionMap _map;
        private readonly InputAction _move;
        private readonly InputAction _look;
        private readonly InputAction _gamepadLook;
        private readonly InputAction _interact;
        private readonly InputAction _pause;
        private readonly InputAction _sprint;
        private readonly InputAction _skip;

        private SettingsData _settings;
        private bool _wantsCursorLock;
        private bool _observedLock;
        private float _suppressPauseUntil;
        private float _lastTouchTime = -100f;

        public TouchInputState Touch { get; } = new TouchInputState();
        public InputDeviceMode Mode { get; private set; }

        /// <summary>False while menus or cinematics own the screen; gameplay actions then read as zero.</summary>
        public bool GameplayEnabled { get; set; }

        public event Action InteractPressed;
        public event Action PausePressed;
        public event Action SkipPressed;
        public event Action<InputDeviceMode> ModeChanged;

        public InputService(SettingsData settings)
        {
            _settings = settings;
            _map = new InputActionMap("Gameplay");

            _move = _map.AddAction("Move", InputActionType.Value, expectedControlLayout: "Vector2");
            _move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
            _move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/upArrow").With("Down", "<Keyboard>/downArrow")
                .With("Left", "<Keyboard>/leftArrow").With("Right", "<Keyboard>/rightArrow");
            _move.AddBinding("<Gamepad>/leftStick");

            _look = _map.AddAction("Look", InputActionType.Value, "<Mouse>/delta", expectedControlLayout: "Vector2");
            _gamepadLook = _map.AddAction("GamepadLook", InputActionType.Value, "<Gamepad>/rightStick", expectedControlLayout: "Vector2");

            _interact = _map.AddAction("Interact", InputActionType.Button, "<Keyboard>/e");
            _interact.AddBinding("<Gamepad>/buttonSouth");

            _pause = _map.AddAction("Pause", InputActionType.Button, "<Keyboard>/escape");
            _pause.AddBinding("<Gamepad>/start");

            _sprint = _map.AddAction("Sprint", InputActionType.Button, "<Keyboard>/leftShift");
            _sprint.AddBinding("<Gamepad>/leftStickPress");

            _skip = _map.AddAction("Skip", InputActionType.Button, "<Keyboard>/space");
            _skip.AddBinding("<Keyboard>/enter");
            _skip.AddBinding("<Gamepad>/buttonEast");

            _interact.performed += _ => { if (GameplayEnabled) InteractPressed?.Invoke(); };
            _pause.performed += _ => RaisePause();
            _skip.performed += _ => SkipPressed?.Invoke();

            _map.Enable();

            Mode = Application.isMobilePlatform || (Touchscreen.current != null && Mouse.current == null)
                ? InputDeviceMode.Touch
                : InputDeviceMode.KeyboardMouse;
        }

        public void BindSettings(SettingsData settings) => _settings = settings;

        public Vector2 Move
        {
            get
            {
                if (!GameplayEnabled) return Vector2.zero;
                var value = _move.ReadValue<Vector2>() + Touch.Move;
                return Vector2.ClampMagnitude(value, 1f);
            }
        }

        public bool SprintHeld => GameplayEnabled && _sprint.IsPressed();

        /// <summary>Camera rotation requested this frame, in degrees (x = yaw, y = pitch, positive = up).</summary>
        public Vector2 ReadLookDegrees(float deltaTime)
        {
            var touchPixels = Touch.ConsumeLook();
            if (!GameplayEnabled) return Vector2.zero;

            float mouseSens = _settings != null ? _settings.mouseSensitivity : 1f;
            float touchSens = _settings != null ? _settings.touchSensitivity : 1f;

            Vector2 degrees = Vector2.zero;

            // Mouse deltas are only meaningful while the pointer is captured; otherwise moving
            // the cursor towards a browser tab would spin the camera.
            if (Cursor.lockState == CursorLockMode.Locked)
                degrees += _look.ReadValue<Vector2>() * (MouseDegreesPerPixel * mouseSens);

            float screenHeight = Mathf.Max(1f, Screen.height);
            degrees += touchPixels * (TouchDegreesPerScreenHeight / screenHeight * touchSens);

            degrees += _gamepadLook.ReadValue<Vector2>() * (GamepadDegreesPerSecond * deltaTime * mouseSens);

            if (_settings != null && _settings.invertLookY) degrees.y = -degrees.y;
            return degrees;
        }

        /// <summary>Same entry point as the E key; used by the touch USE button.</summary>
        public void RequestInteract()
        {
            if (GameplayEnabled) InteractPressed?.Invoke();
        }

        /// <summary>Same entry point as ESC; used by the touch pause button.</summary>
        public void RequestPause() => RaisePause();

        public void RequestSkip() => SkipPressed?.Invoke();

        public void SetCursorLock(bool locked)
        {
            _wantsCursorLock = locked;
            _observedLock = false;
            if (!locked || Mode != InputDeviceMode.KeyboardMouse)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        /// <summary>True when gameplay wants the cursor captured but the browser has not granted it yet.</summary>
        public bool NeedsClickToCapture =>
            _wantsCursorLock && Mode == InputDeviceMode.KeyboardMouse && Cursor.lockState != CursorLockMode.Locked;

        public void Tick()
        {
            DetectDeviceMode();
            UpdateCursor();
        }

        private void UpdateCursor()
        {
            if (!_wantsCursorLock || Mode != InputDeviceMode.KeyboardMouse) return;

            if (Cursor.lockState == CursorLockMode.Locked)
            {
                _observedLock = true;
                return;
            }

            if (_observedLock)
            {
                // The browser released pointer lock (usually ESC, which Unity never receives in that case).
                _observedLock = false;
                _wantsCursorLock = false;
                Cursor.visible = true;
                RaisePause();
                _suppressPauseUntil = Time.unscaledTime + 0.35f;
                return;
            }

            // WebGL only grants pointer lock inside a user gesture; requesting on click is the reliable path.
            var mouse = Mouse.current;
            if (mouse != null && mouse.leftButton.wasPressedThisFrame || Application.isEditor)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        private void RaisePause()
        {
            if (Time.unscaledTime < _suppressPauseUntil) return;
            PausePressed?.Invoke();
        }

        private void DetectDeviceMode()
        {
            var touchscreen = Touchscreen.current;
            if (touchscreen != null && touchscreen.primaryTouch.press.isPressed)
            {
                _lastTouchTime = Time.unscaledTime;
                SetMode(InputDeviceMode.Touch);
                return;
            }

            // Browsers emulate mouse events after touches, so ignore mouse activity right after a touch.
            if (Time.unscaledTime - _lastTouchTime < 1f) return;

            var keyboard = Keyboard.current;
            var mouse = Mouse.current;
            bool keyboardUsed = keyboard != null && keyboard.anyKey.wasPressedThisFrame;
            bool mouseUsed = mouse != null && (mouse.delta.ReadValue().sqrMagnitude > 9f || mouse.leftButton.wasPressedThisFrame);
            if (keyboardUsed || mouseUsed)
            {
                SetMode(InputDeviceMode.KeyboardMouse);
                return;
            }

            var gamepad = Gamepad.current;
            if (gamepad != null && (gamepad.leftStick.ReadValue().sqrMagnitude > 0.1f || gamepad.buttonSouth.wasPressedThisFrame))
                SetMode(InputDeviceMode.Gamepad);
        }

        private void SetMode(InputDeviceMode mode)
        {
            if (Mode == mode) return;
            Mode = mode;
            if (mode != InputDeviceMode.KeyboardMouse)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                _observedLock = false;
            }
            else
            {
                Touch.Clear();
            }
            ModeChanged?.Invoke(mode);
        }

        public void Dispose()
        {
            _map.Disable();
            _map.Dispose();
        }
    }
}
