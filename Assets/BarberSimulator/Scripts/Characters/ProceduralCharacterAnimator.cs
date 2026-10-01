using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.Characters
{
    public enum CharacterPose
    {
        Stand,
        Sit
    }

    /// <summary>Mood layer, read by later customer systems (happy / neutral / annoyed body language).</summary>
    public enum CharacterMood
    {
        Neutral,
        Happy,
        Annoyed
    }

    /// <summary>
    /// Lightweight procedural animation for the modular placeholder bodies: idle breathing, walking,
    /// sitting, talking gestures and head look-at. It deliberately keeps the same "intent" API
    /// (pose, speed, talking, look target, mood) a Mecanim controller will expose once rigged
    /// characters replace the placeholders.
    /// </summary>
    public sealed class ProceduralCharacterAnimator : MonoBehaviour
    {
        [Header("Joints")]
        [SerializeField] private Transform pelvis;
        [SerializeField] private Transform spine;
        [SerializeField] private Transform head;
        [SerializeField] private Transform upperArmL;
        [SerializeField] private Transform upperArmR;
        [SerializeField] private Transform forearmL;
        [SerializeField] private Transform forearmR;
        [SerializeField] private Transform thighL;
        [SerializeField] private Transform thighR;
        [SerializeField] private Transform shinL;
        [SerializeField] private Transform shinR;

        [Header("Tuning")]
        [SerializeField] private float seatPelvisHeight = 0.5f;
        [SerializeField] private float strideDegrees = 26f;
        [SerializeField] private float armSwingDegrees = 16f;

        private Vector3 _pelvisRest;
        private Quaternion _spineRest, _headRest, _uaL, _uaR, _faL, _faR, _thL, _thR, _shL, _shR;
        private float _walkPhase;
        private float _walkBlend;
        private float _sitBlend;
        private float _talkBlend;
        private float _seed;
        private Vector3 _lookTarget;
        private bool _hasLookTarget;
        private float _gestureTime = -10f;

        public CharacterPose Pose { get; set; } = CharacterPose.Stand;
        /// <summary>Pelvis height above the character root while seated (seat surface + ~6 cm).</summary>
        public float SeatPelvisHeight { get => seatPelvisHeight; set => seatPelvisHeight = value; }
        public float WalkSpeed { get; set; }
        public bool Talking { get; set; }
        public CharacterMood Mood { get; set; } = CharacterMood.Neutral;

        public void Configure(Transform pelvisJoint, Transform spineJoint, Transform headJoint, Transform upperArmLeft, Transform upperArmRight,
            Transform forearmLeft, Transform forearmRight, Transform thighLeft, Transform thighRight, Transform shinLeft, Transform shinRight, float seatHeight)
        {
            pelvis = pelvisJoint;
            spine = spineJoint;
            head = headJoint;
            upperArmL = upperArmLeft;
            upperArmR = upperArmRight;
            forearmL = forearmLeft;
            forearmR = forearmRight;
            thighL = thighLeft;
            thighR = thighRight;
            shinL = shinLeft;
            shinR = shinRight;
            seatPelvisHeight = seatHeight;
        }

        private void Awake()
        {
            _seed = Random.value * 100f;
            _pelvisRest = pelvis.localPosition;
            _spineRest = spine.localRotation;
            _headRest = head.localRotation;
            _uaL = upperArmL.localRotation;
            _uaR = upperArmR.localRotation;
            _faL = forearmL.localRotation;
            _faR = forearmR.localRotation;
            _thL = thighL.localRotation;
            _thR = thighR.localRotation;
            _shL = shinL.localRotation;
            _shR = shinR.localRotation;
        }

        public void SetLookTarget(Vector3 worldPosition)
        {
            _lookTarget = worldPosition;
            _hasLookTarget = true;
        }

        public void ClearLookTarget() => _hasLookTarget = false;

        /// <summary>Plays a short gesture. Accepts the trigger names used by dialogue lines.</summary>
        public void Trigger(string gesture)
        {
            if (string.IsNullOrEmpty(gesture)) return;
            _gestureTime = Time.time;
        }

        private void LateUpdate()
        {
            float dt = Time.deltaTime;
            float t = Time.time + _seed;

            _walkBlend = Mathf.Lerp(_walkBlend, Mathf.Clamp01(WalkSpeed / 1.2f), Easing.Damp(8f, dt));
            _sitBlend = Mathf.Lerp(_sitBlend, Pose == CharacterPose.Sit ? 1f : 0f, Easing.Damp(5f, dt));
            _talkBlend = Mathf.Lerp(_talkBlend, Talking ? 1f : 0f, Easing.Damp(6f, dt));
            _walkPhase += dt * Mathf.Lerp(0f, 2f * Mathf.PI * 0.95f * Mathf.Max(0.6f, WalkSpeed), _walkBlend);

            float swing = Mathf.Sin(_walkPhase) * _walkBlend;
            float breathe = Mathf.Sin(t * 1.6f);

            // Pelvis: walk bob, idle weight shift, sit drop.
            var pelvisPos = _pelvisRest;
            pelvisPos.y += Mathf.Abs(Mathf.Cos(_walkPhase)) * 0.025f * _walkBlend;
            pelvisPos.x += Mathf.Sin(t * 0.35f) * 0.012f * (1f - _walkBlend) * (1f - _sitBlend);
            pelvisPos.y = Mathf.Lerp(pelvisPos.y, seatPelvisHeight, _sitBlend);
            pelvis.localPosition = pelvisPos;

            // Spine: breathing, slight lean when walking, recline when seated, mood posture.
            float moodLean = Mood == CharacterMood.Annoyed ? 3f : Mood == CharacterMood.Happy ? -2f : 0f;
            spine.localRotation = _spineRest * Quaternion.Euler(breathe * 0.8f + _walkBlend * 4f - _sitBlend * 6f + moodLean, Mathf.Sin(_walkPhase) * 3f * _walkBlend, 0f);

            // Legs.
            float sitThigh = -88f * _sitBlend;
            float sitShin = 86f * _sitBlend;
            thighL.localRotation = _thL * Quaternion.Euler(-swing * strideDegrees + sitThigh, 0f, 0f);
            thighR.localRotation = _thR * Quaternion.Euler(swing * strideDegrees + sitThigh, 0f, 0f);
            float kneeL = Mathf.Max(0f, Mathf.Sin(_walkPhase + 1.4f)) * 32f * _walkBlend;
            float kneeR = Mathf.Max(0f, Mathf.Sin(_walkPhase + 1.4f + Mathf.PI)) * 32f * _walkBlend;
            shinL.localRotation = _shL * Quaternion.Euler(kneeL + sitShin, 0f, 0f);
            shinR.localRotation = _shR * Quaternion.Euler(kneeR + sitShin, 0f, 0f);

            // Arms: walk swing, relaxed idle sway, talking gestures, resting on lap when seated.
            float gesture = Mathf.Clamp01(1f - (Time.time - _gestureTime) / 1.2f);
            gesture = Mathf.Sin(gesture * Mathf.PI);
            float talkWave = (Mathf.PerlinNoise(t * 1.4f, 3.1f) - 0.3f) * _talkBlend;
            float idleSway = Mathf.Sin(t * 0.9f) * 1.5f;

            upperArmL.localRotation = _uaL * Quaternion.Euler(swing * armSwingDegrees + idleSway - _sitBlend * 28f, 0f, -4f);
            upperArmR.localRotation = _uaR * Quaternion.Euler(-swing * armSwingDegrees - idleSway - _sitBlend * 28f - talkWave * 22f - gesture * 35f, 0f, 4f + gesture * 8f);
            forearmL.localRotation = _faL * Quaternion.Euler(-10f - _walkBlend * 12f - _sitBlend * 40f, 0f, 0f);
            forearmR.localRotation = _faR * Quaternion.Euler(-10f - _walkBlend * 12f - _sitBlend * 40f - talkWave * 40f - gesture * 55f, 0f, 0f);

            UpdateHead(t, dt);
        }

        private void UpdateHead(float t, float dt)
        {
            float nod = Mathf.Sin(t * 7.5f) * 2.2f * _talkBlend;
            Quaternion look;
            if (_hasLookTarget)
            {
                var parent = head.parent;
                var localDir = parent.InverseTransformDirection(_lookTarget - head.position);
                float yaw = Mathf.Clamp(Mathf.Atan2(localDir.x, localDir.z) * Mathf.Rad2Deg, -65f, 65f);
                float pitch = Mathf.Clamp(-Mathf.Atan2(localDir.y, new Vector2(localDir.x, localDir.z).magnitude) * Mathf.Rad2Deg, -25f, 25f);
                look = Quaternion.Euler(pitch + nod, yaw, 0f);
            }
            else
            {
                // Idle glance around every few seconds.
                float yaw = (Mathf.PerlinNoise(t * 0.18f, 7.7f) - 0.5f) * 70f;
                float pitch = (Mathf.PerlinNoise(1.3f, t * 0.15f) - 0.5f) * 14f;
                look = Quaternion.Euler(pitch + nod, yaw, 0f);
            }

            var target = _headRest * look;
            head.localRotation = Quaternion.Slerp(head.localRotation, target, Easing.Damp(4f, dt));
        }
    }
}
