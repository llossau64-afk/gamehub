using System;
using System.Collections.Generic;
using BarberSimulator.Characters;
using BarberSimulator.Haircut;
using BarberSimulator.NPC;
using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>
    /// One customer: appearance, request, patience and the visit state machine (states live in CustomerStates.cs).
    /// Customers are pooled by <see cref="CustomerSpawner"/> and reused through <see cref="BeginVisit"/>.
    /// </summary>
    [RequireComponent(typeof(NpcMotor))]
    public sealed partial class CustomerBrain : MonoBehaviour
    {
        [SerializeField] private ProceduralCharacterAnimator animator;
        [SerializeField] private ModularCharacter character;

        private readonly StateMachine<CustomerState> _machine = new StateMachine<CustomerState>();
        private NpcMotor _motor;
        private ShopCustomerSite _site;
        private CustomerServices _services;
        private System.Random _rng;
        private WaitingSeat _seat;
        private BarberChairStation _chair;
        private float _patience;

        public CustomerState State => _machine.CurrentKey;
        public CustomerProfile Profile { get; private set; }
        public HaircutRequest Request { get; private set; }
        public string DisplayName { get; private set; }
        public bool HasOrdered { get; private set; }
        public bool HasChair => _chair != null;
        public bool IsTutorial => Profile != null && Profile.isTutorial;
        public bool IsReadyForHaircut => State == CustomerState.WaitForPlayer;
        public bool IsAwaitingConversation => State == CustomerState.Dialogue && !_conversationStarted;
        public float Patience01 => Profile == null || Profile.patienceSeconds <= 0f ? 1f : Mathf.Clamp01(_patience / Profile.patienceSeconds);
        public ModularCharacter Character => character;
        public ProceduralCharacterAnimator Animator => animator;
        public BarberChairStation Chair => _chair;
        public HaircutResult LastResult { get; private set; }

        public event Action<CustomerBrain> Despawned;
        public event Action<CustomerBrain, CustomerState> StateChanged;

        private bool _conversationStarted;

        public void Configure(ProceduralCharacterAnimator characterAnimator, ModularCharacter modularCharacter)
        {
            animator = characterAnimator;
            character = modularCharacter;
        }

        private void Awake()
        {
            _motor = GetComponent<NpcMotor>();
            if (animator != null) _motor.SetAnimator(animator);
            RegisterStates();
            _machine.Changed += (_, next) => StateChanged?.Invoke(this, next);
        }

        /// <summary>Starts a new visit (pooled reuse).</summary>
        public void BeginVisit(ShopCustomerSite site, CustomerServices services, CustomerProfile profile, int seed)
        {
            _site = site;
            _services = services;
            _rng = new System.Random(seed);
            Profile = profile;
            Request = profile.PickRequest(_rng);
            DisplayName = profile.PickName(_rng);
            HasOrdered = false;
            _conversationStarted = false;
            _seat = null;
            _chair = null;
            _patience = profile.patienceSeconds;
            LastResult = default;

            var look = CharacterAppearanceData.CreateRandom(_rng);
            if (character != null) character.Apply(look, seed);
            if (animator != null)
            {
                animator.Pose = CharacterPose.Stand;
                animator.Talking = false;
                animator.Mood = CharacterMood.Neutral;
                animator.ClearLookTarget();
            }

            gameObject.SetActive(true);
            _site.Join(this);
            _machine.Change(CustomerState.Spawn);
        }

        private void Update()
        {
            if (_machine.HasState) _machine.Tick(Time.deltaTime);
        }

        // ---------------------------------------------------------------- hooks used by gameplay systems

        /// <summary>The player talked to the customer (interaction).</summary>
        public void StartConversation()
        {
            if (State != CustomerState.Dialogue || _conversationStarted) return;
            _conversationStarted = true;
            RunConversation();
        }

        /// <summary>Barber mode started on this customer's chair.</summary>
        public void OnHaircutStarted()
        {
            if (State == CustomerState.WaitForPlayer) _machine.Change(CustomerState.Haircut);
        }

        /// <summary>Barber mode left without finishing (e.g. the player stepped away): back to waiting.</summary>
        public void OnHaircutPaused()
        {
            if (State == CustomerState.Haircut) _machine.Change(CustomerState.WaitForPlayer);
        }

        /// <summary>The haircut was finished and scored.</summary>
        public void OnHaircutFinished(HaircutResult result)
        {
            LastResult = result;
            if (State == CustomerState.Haircut) _machine.Change(CustomerState.Result);
        }

        // ---------------------------------------------------------------- helpers shared by states

        private void Go(Transform goal, Quaternion? face = null)
        {
            var path = _site.PathTo(transform.position, goal);
            _motor.FollowPath(path, face ?? goal.rotation);
        }

        private bool Arrived => _motor.HasArrived;

        private void DrainPatience(float deltaTime, float rate)
        {
            if (Profile.patienceSeconds <= 0f) return;
            _patience -= deltaTime * rate;
            if (animator != null) animator.Mood = Patience01 < 0.3f ? CharacterMood.Annoyed : CharacterMood.Neutral;
            if (_patience <= 0f) LeaveAngry();
        }

        private void LeaveAngry()
        {
            Say(CustomerDialogueSet.Pick(Profile.dialogue != null ? Profile.dialogue.leaveImpatient : null, _rng), 3f);
            if (animator != null) animator.Trigger("disappointed");
            _services.Economy?.AdjustReputation(-3f);
            _machine.Change(CustomerState.Leave);
        }

        private void Say(string key, float seconds)
        {
            if (string.IsNullOrEmpty(key) || _services.Dialogue == null) return;
            _services.Dialogue.Say(DisplayName, Text(key), seconds);
            if (animator != null)
            {
                animator.Talking = true;
                CancelInvoke(nameof(StopTalking));
                Invoke(nameof(StopTalking), Mathf.Max(1f, seconds * 0.8f));
            }
        }

        private void StopTalking()
        {
            if (animator != null) animator.Talking = false;
        }

        private string Text(string key)
        {
            var text = _services.Localization.Get(key);
            if (Request != null) text = text.Replace("{style}", _services.Localization.Get(Request.NameKey));
            return text.Replace("{name}", DisplayName);
        }

        private void RunConversation()
        {
            var set = Profile.dialogue;
            string ask = Request != null && Request.AskLineKeys.Count > 0
                ? Request.AskLineKeys[_rng.Next(Request.AskLineKeys.Count)]
                : CustomerDialogueSet.Pick(set != null ? set.greetings : null, _rng);
            string greeting = Text(CustomerDialogueSet.Pick(set != null ? set.greetings : null, _rng));
            string line = string.IsNullOrEmpty(greeting) ? Text(ask) : greeting + " " + Text(ask);

            if (animator != null) { animator.Talking = true; animator.Trigger("gesture"); }
            var options = new[] { _services.Localization.Get("reply.sure"), _services.Localization.Get("reply.one_second") };
            _services.Dialogue.Ask(DisplayName, line, options, choice =>
            {
                StopTalking();
                HasOrdered = true;
                _site.ReleaseReception(this);
                Say(CustomerDialogueSet.Pick(choice == 0 ? set?.afterAgree : set?.afterWait, _rng), 2.4f);
                _services.Objectives?.Signal(Objectives.ObjectiveSignals.CustomerGreeted);
                _machine.Change(CustomerState.CheckAvailability);
            });
        }

        /// <summary>Animated sit: walk position → turn → lower onto the seat.</summary>
        private System.Collections.IEnumerator SitRoutine(Transform seatPoint, Action done)
        {
            var chairRoot = seatPoint.parent != null ? seatPoint.parent : seatPoint;
            var from = transform.position;
            var target = new Vector3(seatPoint.position.x, chairRoot.position.y, seatPoint.position.z);
            var fromRotation = transform.rotation;
            var targetRotation = Quaternion.Euler(0f, seatPoint.eulerAngles.y, 0f);
            if (animator != null) animator.SeatPelvisHeight = seatPoint.position.y - chairRoot.position.y + 0.07f;

            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / 0.35f;
                transform.rotation = Quaternion.Slerp(fromRotation, targetRotation, Core.Easing.SmoothStep(t));
                yield return null;
            }

            if (animator != null) animator.Pose = CharacterPose.Sit;
            _services.Audio?.PlaySfxAt(_services.Audio.Library != null ? _services.Audio.Library.clothSit : null, transform.position, 0.7f);
            t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / 0.75f;
                transform.position = Vector3.Lerp(from, target, Core.Easing.SmoothStep(t));
                yield return null;
            }
            _motor.Warp(transform.position, transform.rotation);
            done?.Invoke();
        }

        private System.Collections.IEnumerator StandRoutine(Transform standPoint, Action done)
        {
            if (animator != null) animator.Pose = CharacterPose.Stand;
            _services.Audio?.PlaySfxAt(_services.Audio.Library != null ? _services.Audio.Library.clothStand : null, transform.position, 0.7f);
            var from = transform.position;
            var target = standPoint != null ? standPoint.position : from + transform.forward * 0.45f;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / 0.8f;
                transform.position = Vector3.Lerp(from, target, Core.Easing.SmoothStep(t));
                yield return null;
            }
            _motor.Warp(transform.position, transform.rotation);
            done?.Invoke();
        }

        private void FinishVisit()
        {
            _site.Leave(this);
            gameObject.SetActive(false);
            Despawned?.Invoke(this);
        }
    }
}
