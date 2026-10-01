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

        // Barber mode
        private readonly InputActionMap _barberMap;
        private readonly InputAction _cut;
        private readonly InputAction _orbitHold;
        private readonly InputAction _orbitKeys;
        private readonly InputAction _zoom;
        private readonly InputAction _finish;
        private readonly InputAction _guardDown;
        private readonly InputAction _guardUp;
        private readonly InputAction[] _toolKeys = new InputAction[4];

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

        /// <summary>Barber mode actions; gated by <see cref="BarberEnabled"/>.</summary>
        public bool BarberEnabled { get; set; }
        public event Action<int> ToolHotkeyPressed;
        public event Action<int> GuardStepPressed;
        public event Action FinishPressed;

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

            _barberMap = new InputActionMap("Barber");
            _cut = _barberMap.AddAction("Cut", InputActionType.Button, "<Mouse>/leftButton");
            _cut.AddBinding("<Gamepad>/rightTrigger");
            _orbitHold = _barberMap.AddAction("OrbitHold", InputActionType.Button, "<Mouse>/rightButton");
            _orbitKeys = _barberMap.AddAction("OrbitKeys", InputActionType.Value, expectedControlLayout: "Vector2");
            _orbitKeys.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
            _orbitKeys.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/upArrow").With("Down", "<Keyboard>/downArrow")
                .With("Left", "<Keyboard>/leftArrow").With("Right", "<Keyboard>/rightArrow");
            _zoom = _barberMap.AddAction("Zoom", InputActionType.Value, "<Mouse>/scroll/y");
            _finish = _barberMap.AddAction("Finish", InputActionType.Button, "<Keyboard>/f");
            _guardDown = _barberMap.AddAction("GuardDown", InputActionType.Button, "<Keyboard>/q");
            _guardDown.AddBinding("<Gamepad>/leftShoulder");
            _guardUp = _barberMap.AddAction("GuardUp", InputActionType.Button, "<Keyboard>/e");
            _guardUp.AddBinding("<Gamepad>/rightShoulder");
            for (int i = 0; i < _toolKeys.Length; i++)
            {
                int index = i;
                _toolKeys[i] = _barberMap.AddAction("Tool" + (i + 1), InputActionType.Button, "<Keyboard>/" + (i + 1));
                _toolKeys[i].performed += _ => { if (BarberEnabled) ToolHotkeyPressed?.Invoke(index); };
            }
            _guardDown.performed += _ => { if (BarberEnabled) GuardStepPressed?.Invoke(-1); };
            _guardUp.performed += _ => { if (BarberEnabled) GuardStepPressed?.Invoke(1); };
            _finish.performed += _ => { if (BarberEnabled) FinishPressed?.Invoke(); };
            _barberMap.Enable();

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

        // ------------------------------------------------------------------ barber mode

        /// <summary>True while the cut action is held (left mouse, gamepad trigger or the touch CUT button).</summary>
        public bool CutHeld
        {
            get
            {
                if (!BarberEnabled) return false;
                if (Touch.CutHeld) return true;
                if (Mode == InputDeviceMode.Touch) return false;
                // Clicks on UI buttons must never cut.
                var es = UnityEngine.EventSystems.EventSystem.current;
                if (Mode == InputDeviceMode.KeyboardMouse && es != null && es.IsPointerOverGameObject()) return _cutHeldStartedOffUi && _cut.IsPressed();
                return _cut.IsPressed();
            }
        }

        private bool _cutHeldStartedOffUi;

        /// <summary>Screen position the tool aims at: the mouse on desktop, a fixed reticle on touch/gamepad.</summary>
        public Vector2 AimScreenPosition
        {
            get
            {
                if (Mode == InputDeviceMode.KeyboardMouse && Mouse.current != null) return Mouse.current.position.ReadValue();
                return new Vector2(Screen.width * 0.5f, Screen.height * 0.56f);
            }
        }

        /// <summary>Orbit request in degrees for this frame (x = around the head, y = up/down).</summary>
        public Vector2 ReadOrbitDegrees(float deltaTime)
        {
            var touchPixels = Touch.ConsumeLook();
            if (!BarberEnabled) return Vector2.zero;
            float touchSens = _settings != null ? _settings.touchSensitivity : 1f;
            float mouseSens = _settings != null ? _settings.mouseSensitivity : 1f;
            var degrees = touchPixels * (200f / Mathf.Max(1f, Screen.height) * touchSens);
            if (_orbitHold.IsPressed() && Mouse.current != null)
                degrees += Mouse.current.delta.ReadValue() * (0.22f * mouseSens);
            degrees += _orbitKeys.ReadValue<Vector2>() * (95f * deltaTime);
            degrees += _gamepadLook.ReadValue<Vector2>() * (120f * deltaTime);
            return degrees;
        }

        /// <summary>Zoom request (-1..1) for this frame.</summary>
        public float ReadZoom()
        {
            if (!BarberEnabled) return 0f;
            float scroll = _zoom.ReadValue<float>();
            return Mathf.Clamp(scroll / 120f, -1f, 1f) + Touch.ConsumeZoom();
        }

        public void RequestToolHotkey(int index) => ToolHotkeyPressed?.Invoke(index);
        public void RequestFinish() => FinishPressed?.Invoke();

        /// <summary>Same entry point as the E key; used by the touch USE button.</summary>
        public void RequestInteract()
        {
            if (GameplayEnabled) InteractPressed?.Invoke();
        }

        /// <summary>Same entry point as ESC; used by the touch pause button.</summary>
        public void RequestPause() => RaisePause();

        public void RequestSkip() => SkipPressed?.Invoke();

        /// <summary>True while a skip key (Space, Enter, Esc, gamepad B) is held: cutscenes require a hold to skip.</summary>
        public bool SkipHeld => _skip.IsPressed() || _pause.IsPressed();

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
            if (_cut.WasPressedThisFrame())
            {
                var es = UnityEngine.EventSystems.EventSystem.current;
                _cutHeldStartedOffUi = es == null || !es.IsPointerOverGameObject();
            }
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
            _barberMap.Disable();
            _barberMap.Dispose();
        }
    }
}
