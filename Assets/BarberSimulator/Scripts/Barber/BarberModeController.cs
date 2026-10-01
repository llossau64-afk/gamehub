using System;
using System.Collections;
using System.Collections.Generic;
using BarberSimulator.Audio;
using BarberSimulator.CameraSystems;
using BarberSimulator.Core;
using BarberSimulator.Customers;
using BarberSimulator.Haircut;
using BarberSimulator.Input;
using BarberSimulator.Localization;
using BarberSimulator.Player;
using UnityEngine;

namespace BarberSimulator.Barber
{
    /// <summary>
    /// First-person Barber Mode: the camera orbits the seated customer's head, the player's hand holds the active
    /// tool against the hair where they aim (mouse on desktop, a reticle on touch) and cutting happens while the
    /// cut action is held. Owns the haircut session for its duration and hands the result back to the customer.
    /// </summary>
    public sealed class BarberModeController : MonoBehaviour
    {
        [SerializeField] private BarberToolDefinition[] tools = Array.Empty<BarberToolDefinition>();
        [SerializeField] private Material hairParticleMaterial;

        [Header("Camera")]
        [SerializeField] private float startYaw = 140f;
        [SerializeField] private float startPitch = 16f;
        [SerializeField] private float minPitch = -18f;
        [SerializeField] private float maxPitch = 68f;
        [SerializeField] private float distance = 0.56f;
        [SerializeField] private float minDistance = 0.36f;
        [SerializeField] private float maxDistance = 0.8f;
        [SerializeField] private float fieldOfView = 46f;

        private const float ToolSurfaceOffset = 0.005f;
        private static readonly Vector3 HandSocketLocal = new Vector3(0f, 0.02f, 0.11f);

        private CinematicCamera _camera;
        private FirstPersonController _player;
        private FirstPersonHands _hands;
        private InputService _input;
        private AudioService _audio;
        private LocalizationService _localization;
        private IBarberModeView _view;
        private float _gameplayFov;

        private BarberChairStation _chair;
        private CustomerBrain _customer;
        private HairShellRenderer _shell;
        private HaircutSession _session;
        private BarberTutorial _tutorial;
        private int _toolIndex;

        private float _yaw, _pitch, _distance;
        private float _targetYaw, _targetPitch, _targetDistance;
        private bool _cameraReady;
        private Vector3 _rigPosition;
        private Quaternion _rigRotation;
        private float _equipDip;
        private float _totalRemoved;
        private float _checklistTimer;
        private bool _wasCutting;

        private AudioSource _motorSource;
        private AudioSource _cuttingSource;
        private float _motorLevel;
        private float _cuttingLevel;
        private ParticleSystem _particles;
        private float _particleBudget;

        public bool IsActive { get; private set; }
        public HaircutSession Session => _session;
        public CustomerBrain Customer => _customer;
        public IReadOnlyList<BarberToolDefinition> Tools => tools;

        public event Action Entered;
        public event Action Exited;

        public void Configure(BarberToolDefinition[] toolSet, Material particleMaterial)
        {
            tools = toolSet;
            hairParticleMaterial = particleMaterial;
        }

        public void Initialize(CinematicCamera cinematicCamera, FirstPersonController player, FirstPersonHands hands, InputService input,
            AudioService audio, LocalizationService localization, IBarberModeView view, float gameplayFov)
        {
            _camera = cinematicCamera;
            _player = player;
            _hands = hands;
            _input = input;
            _audio = audio;
            _localization = localization;
            _view = view;
            _gameplayFov = gameplayFov;

            _motorSource = audio.CreateLoopSource("Clipper Motor");
            _cuttingSource = audio.CreateLoopSource("Clipper Cutting");
            if (audio.Library != null) _cuttingSource.clip = audio.Library.clipperCuttingLoop;
            CreateParticles();

            _view.ToolClicked += SelectTool;
            _view.GuardClicked += i => { _session?.SelectGuard(i); RefreshGuards(); PlayToolSelect(); };
            _view.FinishClicked += RequestFinish;
            _view.FinishConfirmed += Finish;
            _view.BackClicked += () => Exit(finished: false);
            _input.ToolHotkeyPressed += i => { if (IsActive) SelectTool(i); };
            _input.GuardStepPressed += step => { if (IsActive && _session != null) { _session.StepGuard(step); RefreshGuards(); PlayToolSelect(); } };
            _input.FinishPressed += () => { if (IsActive) RequestFinish(); };
            _input.ModeChanged += mode => { if (IsActive) _view.SetTouchMode(mode == InputDeviceMode.Touch); };
        }

        // ---------------------------------------------------------------- enter / exit

        public bool CanStart(BarberChairStation chair) => !IsActive && chair != null && chair.Occupant != null && chair.Occupant.IsReadyForHaircut;

        public void Begin(BarberChairStation chair)
        {
            if (!CanStart(chair)) return;
            _chair = chair;
            _customer = chair.Occupant;
            _shell = _customer.Character != null ? _customer.Character.HairShell : null;
            if (_shell == null || _shell.Grid == null)
            {
                Debug.LogError("[BarberMode] Customer has no hair shell; cannot start a haircut.");
                return;
            }

            bool tutorial = _customer.IsTutorial;
            float leniency = Mathf.Max(0.5f, _customer.Profile.leniency) * (tutorial ? 1.7f : 1f);
            _session = new HaircutSession(_shell.Grid, _customer.Request, leniency, tutorial);
            _session.ToolAction += OnToolAction;
            _tutorial = tutorial ? new BarberTutorial() : null;
            _totalRemoved = 0f;

            IsActive = true;
            _cameraReady = false;
            _player.SetControlEnabled(false);
            _input.GameplayEnabled = false;
            _input.BarberEnabled = true;
            _input.SetCursorLock(false);

            chair.BeginHaircut();
            _customer.OnHaircutStarted();

            _view.Open(_customer.DisplayName, _localization.Get(_customer.Request.NameKey), _customer.Request.ChecklistKeys(), tools, _input.Mode == InputDeviceMode.Touch);
            // Start with the scissors' neighbour that is safe: the clipper on the longest guard.
            _toolIndex = -1;
            SelectTool(0, silent: true);
            if (_session.Tool != null && _session.Tool.HasGuards) _session.SelectGuard(_session.Tool.guardLengths.Length - 1);
            RefreshGuards();
            UpdateHint(force: true);

            _yaw = _targetYaw = startYaw;
            _pitch = _targetPitch = startPitch;
            _distance = _targetDistance = distance;
            _camera.Detach();
            StartCoroutine(BlendIn());

            _hands.BeginExternalControl(HandToolFor(_session.Tool));
            var cam = _camera.Camera.transform;
            _rigPosition = RestPosition(cam);
            _rigRotation = RestRotation(cam);

            Entered?.Invoke();
        }

        private IEnumerator BlendIn()
        {
            var cam = _camera.Camera.transform;
            var fromPos = cam.position;
            var fromRot = cam.rotation;
            float fromFov = _camera.Camera.fieldOfView;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / 0.9f;
                ComputeOrbit(out var pos, out var rot);
                float e = Easing.SmootherStep(t);
                cam.SetPositionAndRotation(Vector3.Lerp(fromPos, pos, e), Quaternion.Slerp(fromRot, rot, e));
                _camera.Camera.fieldOfView = Mathf.Lerp(fromFov, fieldOfView, e);
                yield return null;
            }
            _cameraReady = true;
        }

        private void RequestFinish()
        {
            if (!IsActive || _session == null) return;
            var preview = _session.Evaluate();
            if (preview.Completion < 0.5f) _view.AskFinishConfirmation();
            else Finish();
        }

        private void Finish()
        {
            if (!IsActive) return;
            var result = _session.Evaluate();
            _tutorial?.MarkFinished();
            var customer = _customer;
            var chair = _chair;
            Exit(finished: true);
            chair.EndHaircut(_totalRemoved);
            customer.OnHaircutFinished(result);
        }

        private void Exit(bool finished)
        {
            if (!IsActive) return;
            IsActive = false;
            StopAllCoroutines();
            StopToolAudio(immediate: false);
            _hands.SetCutting(false);
            _hands.EndExternalControl();
            _view.Close();
            if (_session != null) _session.ToolAction -= OnToolAction;

            if (!finished)
            {
                _chair.EndHaircut(0f);
                _customer.OnHaircutPaused();
            }

            _input.BarberEnabled = false;
            _input.Touch.CutHeld = false;
            StartCoroutine(BlendOut());
        }

        private IEnumerator BlendOut()
        {
            yield return _camera.BlendToAttach(_player.Head, _gameplayFov, 0.75f);
            _player.SetControlEnabled(true);
            _input.GameplayEnabled = true;
            _input.SetCursorLock(true);
            _session = null;
            _customer = null;
            _chair = null;
            Exited?.Invoke();
        }

        // ---------------------------------------------------------------- tools

        private void SelectTool(int index) => SelectTool(index, silent: false);

        private void SelectTool(int index, bool silent)
        {
            if (_session == null || index < 0 || index >= tools.Length || tools[index] == null) return;
            if (index == _toolIndex) return;
            StopToolAudio(immediate: false);
            _toolIndex = index;
            _session.SelectTool(tools[index]);
            _equipDip = silent ? 0f : 1f;
            if (_hands.ExternallyControlled) _hands.SetExternalTool(HandToolFor(tools[index]));
            _motorSource.clip = tools[index].loopClip;
            _view.SetSelectedTool(index, tools[index]);
            RefreshGuards();
            if (!silent) PlayToolSelect();
        }

        private void RefreshGuards()
        {
            var tool = _session?.Tool;
            if (tool == null || !tool.HasGuards) _view.SetGuards(null, -1);
            else _view.SetGuards(tool.guardLabels, _session.GuardIndex);
        }

        private void PlayToolSelect()
        {
            if (_audio.Library != null) _audio.PlayUI(_audio.Library.uiToolSelect, 0.7f);
        }

        private static HandToolType HandToolFor(BarberToolDefinition tool)
        {
            if (tool == null) return HandToolType.None;
            switch (tool.type)
            {
                case BarberToolType.Clipper: return HandToolType.Clipper;
                case BarberToolType.Trimmer: return HandToolType.Trimmer;
                case BarberToolType.Scissors: return HandToolType.Scissors;
                case BarberToolType.Comb: return HandToolType.Comb;
                default: return HandToolType.None;
            }
        }

        private static float TipLength(BarberToolDefinition tool)
        {
            if (tool == null) return 0.08f;
            switch (tool.type)
            {
                case BarberToolType.Clipper: return 0.085f;
                case BarberToolType.Trimmer: return 0.08f;
                case BarberToolType.Scissors: return 0.088f;
                default: return 0.09f;
            }
        }

        // ---------------------------------------------------------------- per frame

        private void Update()
        {
            if (!IsActive || _session == null || Time.timeScale <= 0f)
            {
                if (IsActive && Time.timeScale <= 0f) StopToolAudio(immediate: true);
                return;
            }

            float dt = Time.deltaTime;
            UpdateOrbit(dt);

            var cam = _camera.Camera;
            var ray = cam.ScreenPointToRay(_input.AimScreenPosition);
            bool onHead = _shell.Raycast(ray, out var hitPoint, out var direction, out var normal);
            bool cutHeld = _input.CutHeld;
            bool cutting = cutHeld && onHead;

            float removed = _session.Apply(direction, dt, cutting);
            _totalRemoved += removed;

            UpdateToolRig(cam.transform, onHead, direction, cutting, dt);
            UpdateToolAudio(cutHeld, removed, dt);
            EmitClippings(onHead ? hitPoint : Vector3.zero, normal, removed, dt);
            _hands.SetCutting(cutting);
            _view.SetAim(onHead, cutting);

            _checklistTimer -= dt;
            if (_checklistTimer <= 0f)
            {
                _checklistTimer = 0.4f;
                _view.SetChecklist(HaircutEvaluator.ChecklistStatus(_session.Grid, _session.Request, _session.Leniency));
                UpdateHint(force: false);
            }
            _wasCutting = cutting;
        }

        private void UpdateHint(bool force)
        {
            if (_tutorial != null)
            {
                if (_tutorial.Update(_session) || force) _view.SetHint(_localization.Get(_tutorial.HintKey));
                return;
            }
            if (force) _view.SetHint(string.Empty);
        }

        private void UpdateOrbit(float dt)
        {
            var orbit = _input.ReadOrbitDegrees(dt);
            _targetYaw += orbit.x;
            _targetPitch = Mathf.Clamp(_targetPitch - orbit.y, minPitch, maxPitch);
            _targetDistance = Mathf.Clamp(_targetDistance - _input.ReadZoom() * 0.06f, minDistance, maxDistance);

            float k = Easing.Damp(12f, dt);
            _yaw = Mathf.Lerp(_yaw, _targetYaw, k);
            _pitch = Mathf.Lerp(_pitch, _targetPitch, k);
            _distance = Mathf.Lerp(_distance, _targetDistance, k);

            if (!_cameraReady) return;
            ComputeOrbit(out var position, out var rotation);
            _camera.Camera.transform.SetPositionAndRotation(position, rotation);
            _camera.Camera.fieldOfView = fieldOfView;
        }

        /// <summary>Orbit around the head in the customer's frame; walls push the camera in, never through.</summary>
        private void ComputeOrbit(out Vector3 position, out Quaternion rotation)
        {
            var pivot = _shell.WorldCenter + Vector3.up * 0.01f;
            var facing = Quaternion.LookRotation(Vector3.ProjectOnPlane(_customer.transform.forward, Vector3.up).normalized, Vector3.up);
            var direction = facing * Quaternion.Euler(-_pitch, _yaw, 0f) * Vector3.forward;
            float allowed = _distance;
            if (Physics.SphereCast(pivot, 0.07f, direction, out var hit, _distance, ~0, QueryTriggerInteraction.Ignore))
            {
                if (!hit.collider.transform.IsChildOf(_customer.transform) && (_chair == null || !hit.collider.transform.IsChildOf(_chair.transform)))
                    allowed = Mathf.Max(0.22f, hit.distance - 0.04f);
            }
            position = pivot + direction * allowed;
            rotation = Quaternion.LookRotation(pivot - position, Vector3.up);
        }

        private void UpdateToolRig(Transform cam, bool onHead, Vector3 direction, bool cutting, float dt)
        {
            Vector3 targetPosition;
            Quaternion targetRotation;
            var tool = _session.Tool;
            float tip = TipLength(tool);
            var tipLocal = HandSocketLocal + Vector3.forward * tip;

            if (onHead)
            {
                var surface = _shell.SurfacePoint(direction, ToolSurfaceOffset, out var normal);
                // Tool runs up along the head with its working side against the hair.
                var up = Vector3.ProjectOnPlane(Vector3.up, normal);
                if (up.sqrMagnitude < 0.04f) up = Vector3.ProjectOnPlane(cam.forward, normal);
                if (tool != null && tool.type == BarberToolType.Scissors) up = Vector3.ProjectOnPlane(cam.right, normal);
                targetRotation = Quaternion.LookRotation(up.normalized, normal);
                targetPosition = surface - targetRotation * tipLocal;
            }
            else
            {
                targetRotation = RestRotation(cam);
                targetPosition = RestPosition(cam);
            }

            _equipDip = Mathf.MoveTowards(_equipDip, 0f, dt / 0.3f);
            targetPosition -= cam.up * (Mathf.Sin(_equipDip * Mathf.PI) * 0.12f);

            _rigPosition = Vector3.Lerp(_rigPosition, targetPosition, Easing.Damp(onHead ? 22f : 12f, dt));
            _rigRotation = Quaternion.Slerp(_rigRotation, targetRotation, Easing.Damp(onHead ? 18f : 10f, dt));

            var position = _rigPosition;
            if (cutHeldMotor(tool) && _input.CutHeld) position += UnityEngine.Random.insideUnitSphere * 0.0009f;
            _hands.SetRightArmWorldPose(position, _rigRotation);
        }

        private static bool cutHeldMotor(BarberToolDefinition tool) => tool != null && tool.IsMotorTool;

        private static Vector3 RestPosition(Transform cam) => cam.position + cam.right * 0.16f - cam.up * 0.17f + cam.forward * 0.3f;
        private static Quaternion RestRotation(Transform cam) => cam.rotation * Quaternion.Euler(-12f, -14f, 4f);

        // ---------------------------------------------------------------- audio & particles

        private void UpdateToolAudio(bool cutHeld, float removed, float dt)
        {
            var tool = _session.Tool;
            float sfx = _audio.CategoryVolume(AudioCategory.Sfx);
            bool motor = tool != null && tool.IsMotorTool && cutHeld;

            if (motor && _motorLevel <= 0f && tool.startClip != null) _audio.PlaySfx(tool.startClip, 0.8f);
            if (!motor && _motorLevel > 0.5f && tool != null && tool.stopClip != null && _wasMotorOn) _audio.PlaySfx(tool.stopClip, 0.8f);
            _wasMotorOn = motor;

            _motorLevel = Mathf.MoveTowards(_motorLevel, motor ? 1f : 0f, dt / (motor ? 0.18f : 0.12f));
            if (_motorLevel > 0f && !_motorSource.isPlaying && _motorSource.clip != null) _motorSource.Play();
            if (_motorLevel <= 0f && _motorSource.isPlaying) _motorSource.Stop();
            _motorSource.volume = _motorLevel * sfx * Mathf.Lerp(0.55f, 0.9f, tool != null ? tool.noise : 0.5f);
            _motorSource.pitch = 0.94f + 0.06f * _motorLevel + Mathf.Clamp01(removed * 40f) * -0.03f;

            float cuttingTarget = motor ? Mathf.Clamp01(removed / Mathf.Max(0.0001f, dt) * 0.05f) : 0f;
            _cuttingLevel = Mathf.MoveTowards(_cuttingLevel, cuttingTarget, dt / 0.08f);
            if (_cuttingLevel > 0.01f && !_cuttingSource.isPlaying && _cuttingSource.clip != null) _cuttingSource.Play();
            if (_cuttingLevel <= 0.01f && _cuttingSource.isPlaying) _cuttingSource.Stop();
            _cuttingSource.volume = _cuttingLevel * sfx * 0.8f;
        }

        private bool _wasMotorOn;

        private void StopToolAudio(bool immediate)
        {
            if (_motorSource == null) return;
            if (!immediate && _motorLevel > 0.5f && _session?.Tool != null && _session.Tool.stopClip != null) _audio.PlaySfx(_session.Tool.stopClip, 0.7f);
            _motorLevel = 0f;
            _cuttingLevel = 0f;
            _wasMotorOn = false;
            _motorSource.Stop();
            _cuttingSource.Stop();
        }

        private void OnToolAction(BarberToolType type, Vector3 direction)
        {
            var library = _audio.Library;
            if (library == null) return;
            if (type == BarberToolType.Scissors) _audio.PlayRandomSfx(library.scissorSnips, 0.8f, 0.08f);
            else if (type == BarberToolType.Comb) _audio.PlayRandomSfx(library.combStrokes, 0.6f, 0.05f);
        }

        private void CreateParticles()
        {
            var go = new GameObject("Hair Clippings FX");
            go.transform.SetParent(transform, false);
            _particles = go.AddComponent<ParticleSystem>();
            _particles.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = _particles.main;
            main.playOnAwake = false;
            main.loop = false;
            main.maxParticles = 260;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.7f, 1.2f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.02f, 0.12f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.0025f, 0.006f);
            main.gravityModifier = new ParticleSystem.MinMaxCurve(0.55f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var emission = _particles.emission;
            emission.enabled = false;
            var shape = _particles.shape;
            shape.enabled = false;
            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.lengthScale = 2.5f;
            renderer.velocityScale = 0.05f;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            if (hairParticleMaterial != null) renderer.sharedMaterial = hairParticleMaterial;
        }

        private void EmitClippings(Vector3 point, Vector3 normal, float removed, float dt)
        {
            if (removed <= 0f || _particles == null) return;
            float quality = QualitySettings.GetQualityLevel() == 0 ? 0.4f : 1f;
            _particleBudget += removed * 120f * quality;
            int count = Mathf.Min(12, Mathf.FloorToInt(_particleBudget));
            if (count <= 0) return;
            _particleBudget -= count;
            var color = _customer.Character != null ? _customer.Character.Current.hairColor : new Color(0.1f, 0.08f, 0.06f);
            for (int i = 0; i < count; i++)
            {
                var emit = new ParticleSystem.EmitParams
                {
                    position = point + UnityEngine.Random.insideUnitSphere * 0.012f,
                    velocity = normal * UnityEngine.Random.Range(0.03f, 0.12f) + UnityEngine.Random.insideUnitSphere * 0.05f,
                    startColor = Color.Lerp(color, color * 1.3f, UnityEngine.Random.value)
                };
                _particles.Emit(emit, 1);
            }
        }
    }
}
