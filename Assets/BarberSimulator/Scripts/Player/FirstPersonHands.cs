using System;
using System.Collections;
using System.Collections.Generic;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.Player
{
    public enum HandToolType
    {
        None,
        Clipper,
        Scissors,
        Comb,
        Razor,
        HairDryer,
        SprayBottle,
        Trimmer
    }

    /// <summary>
    /// Animation states the haircut phase will drive. Phase 1 uses Hidden, Reach and ClipperIdle;
    /// the rest are reserved so the haircut system can plug in without changing this API.
    /// </summary>
    public enum HandAnimationState
    {
        Hidden,
        Idle,
        Reach,
        ClipperIdle,
        ClipperCut,
        ScissorsIdle,
        ScissorsCut,
        Comb,
        HairDryer,
        Razor
    }

    /// <summary>
    /// First-person arms that only appear during interactions. Poses are procedural for now; the
    /// RightHandTool / LeftHandSupport sockets are where rigged arms and tool animations will attach.
    /// </summary>
    public sealed class FirstPersonHands : MonoBehaviour
    {
        [Serializable]
        public sealed class ToolVisual
        {
            public HandToolType type;
            public GameObject visual;
        }

        [SerializeField] private Transform rightArm;
        [SerializeField] private Transform leftArm;
        [SerializeField] private Transform rightHandTool;
        [SerializeField] private Transform leftHandSupport;
        [SerializeField] private List<ToolVisual> tools = new List<ToolVisual>();

        [Header("Poses (local to the camera)")]
        [SerializeField] private Vector3 rightHiddenPos = new Vector3(0.24f, -0.55f, 0.25f);
        [SerializeField] private Vector3 rightShownPos = new Vector3(0.2f, -0.24f, 0.42f);
        [SerializeField] private Vector3 rightReachPos = new Vector3(0.12f, -0.34f, 0.62f);
        [SerializeField] private Vector3 leftHiddenPos = new Vector3(-0.26f, -0.55f, 0.25f);
        [SerializeField] private Vector3 leftShownPos = new Vector3(-0.2f, -0.27f, 0.4f);

        private Quaternion _rightRestRotation;
        private Quaternion _leftRestRotation;
        private Coroutine _routine;
        private float _vibration;

        public HandAnimationState State { get; private set; } = HandAnimationState.Hidden;
        public HandToolType CurrentTool { get; private set; } = HandToolType.None;
        public Transform RightHandTool => rightHandTool;
        public Transform LeftHandSupport => leftHandSupport;

        public event Action<HandAnimationState> StateChanged;

        public Transform RightArm => rightArm;
        public bool ExternallyControlled { get; private set; }

        /// <summary>
        /// Hands the right arm to another system (barber mode places it at the customer's head every frame).
        /// </summary>
        public void BeginExternalControl(HandToolType tool)
        {
            if (_routine != null) StopCoroutine(_routine);
            _routine = null;
            ExternallyControlled = true;
            EquipTool(tool);
            rightArm.gameObject.SetActive(true);
            leftArm.gameObject.SetActive(false);
            SetState(StateFor(tool));
        }

        public void SetExternalTool(HandToolType tool)
        {
            EquipTool(tool);
            SetState(StateFor(tool));
        }

        public void SetRightArmWorldPose(Vector3 position, Quaternion rotation)
        {
            rightArm.SetPositionAndRotation(position, rotation);
        }

        public void SetCutting(bool cutting)
        {
            if (!ExternallyControlled) return;
            var state = StateFor(CurrentTool);
            if (cutting)
            {
                if (CurrentTool == HandToolType.Clipper || CurrentTool == HandToolType.Razor) state = HandAnimationState.ClipperCut;
                else if (CurrentTool == HandToolType.Scissors) state = HandAnimationState.ScissorsCut;
            }
            SetState(state);
        }

        public void EndExternalControl()
        {
            ExternallyControlled = false;
            rightArm.localPosition = rightHiddenPos;
            rightArm.localRotation = _rightRestRotation;
            SetArmsVisible(false);
            EquipTool(HandToolType.None);
            SetState(HandAnimationState.Hidden);
        }

        private static HandAnimationState StateFor(HandToolType tool)
        {
            switch (tool)
            {
                case HandToolType.Clipper: return HandAnimationState.ClipperIdle;
                case HandToolType.Scissors: return HandAnimationState.ScissorsIdle;
                case HandToolType.Comb: return HandAnimationState.Comb;
                case HandToolType.Razor: return HandAnimationState.Razor;
                default: return HandAnimationState.Idle;
            }
        }

        public void Configure(Transform right, Transform left, Transform rightSocket, Transform leftSocket, List<ToolVisual> toolVisuals)
        {
            rightArm = right;
            leftArm = left;
            rightHandTool = rightSocket;
            leftHandSupport = leftSocket;
            tools = toolVisuals;
        }

        private void Awake()
        {
            _rightRestRotation = rightArm.localRotation;
            _leftRestRotation = leftArm.localRotation;
            rightArm.localPosition = rightHiddenPos;
            leftArm.localPosition = leftHiddenPos;
            SetArmsVisible(false);
            EquipTool(HandToolType.None);
        }

        public void EquipTool(HandToolType type)
        {
            CurrentTool = type;
            foreach (var tool in tools)
                if (tool.visual != null) tool.visual.SetActive(tool.type == type);
        }

        /// <summary>Quick right-hand reach used for picking things up.</summary>
        public void PlayReach()
        {
            Run(ReachRoutine());
        }

        /// <summary>Raises both hands holding <paramref name="tool"/> for a moment (e.g. inspecting the clipper).</summary>
        public void PlayToolShowcase(HandToolType tool, float holdSeconds)
        {
            Run(ShowcaseRoutine(tool, holdSeconds));
        }

        public void HideImmediate()
        {
            if (_routine != null) StopCoroutine(_routine);
            _routine = null;
            rightArm.localPosition = rightHiddenPos;
            leftArm.localPosition = leftHiddenPos;
            SetArmsVisible(false);
            SetState(HandAnimationState.Hidden);
        }

        private void Run(IEnumerator routine)
        {
            if (_routine != null) StopCoroutine(_routine);
            _routine = StartCoroutine(routine);
        }

        private IEnumerator ReachRoutine()
        {
            EquipTool(HandToolType.None);
            SetArmsVisible(true, rightOnly: true);
            SetState(HandAnimationState.Reach);
            yield return MoveArm(rightArm, rightArm.localPosition, rightReachPos, _rightRestRotation * Quaternion.Euler(-18f, -8f, 0f), 0.16f);
            yield return new WaitForSeconds(0.08f);
            yield return MoveArm(rightArm, rightArm.localPosition, rightHiddenPos, _rightRestRotation, 0.24f);
            SetArmsVisible(false);
            SetState(HandAnimationState.Hidden);
            _routine = null;
        }

        private IEnumerator ShowcaseRoutine(HandToolType tool, float holdSeconds)
        {
            EquipTool(tool);
            SetArmsVisible(true);
            SetState(HandAnimationState.Idle);

            var leftRoutine = StartCoroutine(MoveArm(leftArm, leftArm.localPosition, leftShownPos, _leftRestRotation, 0.35f));
            yield return MoveArm(rightArm, rightArm.localPosition, rightShownPos, _rightRestRotation * Quaternion.Euler(-8f, -12f, 6f), 0.35f);
            yield return leftRoutine;

            SetState(tool == HandToolType.Clipper ? HandAnimationState.ClipperIdle : HandAnimationState.Idle);
            float t = 0f;
            var basePos = rightArm.localPosition;
            while (t < holdSeconds)
            {
                t += Time.deltaTime;
                // Gentle sway plus clipper vibration while it runs.
                _vibration = tool == HandToolType.Clipper ? 0.0016f : 0f;
                var sway = new Vector3(Mathf.Sin(t * 1.3f) * 0.006f, Mathf.Sin(t * 2.1f) * 0.004f, 0f);
                var buzz = UnityEngine.Random.insideUnitSphere * _vibration;
                rightArm.localPosition = basePos + sway + buzz;
                rightArm.localRotation = _rightRestRotation * Quaternion.Euler(-8f + Mathf.Sin(t * 0.9f) * 6f, -12f + Mathf.Sin(t * 0.7f) * 10f, 6f);
                yield return null;
            }

            var lower = StartCoroutine(MoveArm(leftArm, leftArm.localPosition, leftHiddenPos, _leftRestRotation, 0.3f));
            yield return MoveArm(rightArm, rightArm.localPosition, rightHiddenPos, _rightRestRotation, 0.3f);
            yield return lower;

            SetArmsVisible(false);
            EquipTool(HandToolType.None);
            SetState(HandAnimationState.Hidden);
            _routine = null;
        }

        private static IEnumerator MoveArm(Transform arm, Vector3 from, Vector3 to, Quaternion targetRotation, float duration)
        {
            var fromRotation = arm.localRotation;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / duration;
                float e = Easing.OutCubic(t);
                arm.localPosition = Vector3.LerpUnclamped(from, to, e);
                arm.localRotation = Quaternion.Slerp(fromRotation, targetRotation, e);
                yield return null;
            }
        }

        private void SetArmsVisible(bool visible, bool rightOnly = false)
        {
            rightArm.gameObject.SetActive(visible);
            leftArm.gameObject.SetActive(visible && !rightOnly);
        }

        private void SetState(HandAnimationState state)
        {
            if (State == state) return;
            State = state;
            StateChanged?.Invoke(state);
        }
    }
}
