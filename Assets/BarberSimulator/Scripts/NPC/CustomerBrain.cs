using System;
using BarberSimulator.Characters;
using UnityEngine;

namespace BarberSimulator.NPC
{
    /// <summary>
    /// Customer behaviour as an explicit state machine. Movement/seat states are functional; Talking, Haircut and
    /// Paying wait for external systems (dialogue, haircut, economy) to call the matching Complete method.
    /// Customers are meant to be pooled and re-used through <see cref="BeginVisit"/>.
    /// </summary>
    [RequireComponent(typeof(NpcMotor))]
    public sealed class CustomerBrain : MonoBehaviour
    {
        [SerializeField] private ProceduralCharacterAnimator animator;
        [SerializeField] private ModularCharacter character;
        [SerializeField] private float patienceSeconds = 90f;

        private readonly StateMachine<CustomerState> _machine = new StateMachine<CustomerState>();
        private NpcMotor _motor;
        private ICustomerSite _site;
        private Transform _waitingSeat;
        private Transform _chairSeat;

        public CustomerState State => _machine.CurrentKey;
        public float Patience01 { get; private set; } = 1f;
        public ICustomerSite Site => _site;

        public event Action<CustomerBrain, CustomerState> StateChanged;

        public void Configure(ProceduralCharacterAnimator characterAnimator, ModularCharacter modularCharacter)
        {
            animator = characterAnimator;
            character = modularCharacter;
        }

        private void Awake()
        {
            _motor = GetComponent<NpcMotor>();
            if (animator != null) _motor.SetAnimator(animator);

            _machine.Add(CustomerState.Entering, new WalkState(this, () => _site.Entrance, () => TryTakeWaitingSeat(), CharacterPose.Stand));
            _machine.Add(CustomerState.Waiting, new WaitingState(this));
            _machine.Add(CustomerState.Talking, new HoldState(this, CharacterPose.Stand, talking: true));
            _machine.Add(CustomerState.WalkingToChair, new WalkState(this, () => _chairSeat, () => _machine.Change(CustomerState.Sitting), CharacterPose.Stand));
            _machine.Add(CustomerState.Sitting, new HoldState(this, CharacterPose.Sit, talking: false));
            _machine.Add(CustomerState.Haircut, new HoldState(this, CharacterPose.Sit, talking: false));
            _machine.Add(CustomerState.Paying, new WalkState(this, () => _site.Register, null, CharacterPose.Stand));
            _machine.Add(CustomerState.Leaving, new WalkState(this, () => _site.Exit, () => _machine.Change(CustomerState.Gone), CharacterPose.Stand));
            _machine.Add(CustomerState.Gone, new GoneState(this));
            _machine.Changed += (_, next) => StateChanged?.Invoke(this, next);
        }

        public void BeginVisit(ICustomerSite site, CharacterAppearanceData appearance)
        {
            _site = site;
            Patience01 = 1f;
            gameObject.SetActive(true);
            if (character != null) character.Apply(appearance);
            _machine.Change(CustomerState.Entering);
        }

        private void Update()
        {
            if (_machine.HasState) _machine.Tick(Time.deltaTime);
        }

        // ---- External hooks for later systems -----------------------------------------------------

        public void StartTalking() => _machine.Change(CustomerState.Talking);
        public void FinishTalking() => _machine.Change(_chairSeat != null ? CustomerState.Sitting : CustomerState.Waiting);

        public void CallToChair()
        {
            if (_site.TryReserveBarberChair(this, out _chairSeat))
            {
                _site.ReleaseWaitingSeat(this);
                _waitingSeat = null;
                _machine.Change(CustomerState.WalkingToChair);
            }
        }

        public void StartHaircut() => _machine.Change(CustomerState.Haircut);

        public void FinishHaircut()
        {
            _site.ReleaseBarberChair(this);
            _chairSeat = null;
            _machine.Change(CustomerState.Paying);
        }

        public void FinishPaying() => _machine.Change(CustomerState.Leaving);

        public void LeaveNow()
        {
            if (_waitingSeat != null) _site.ReleaseWaitingSeat(this);
            if (_chairSeat != null) _site.ReleaseBarberChair(this);
            _waitingSeat = _chairSeat = null;
            _machine.Change(CustomerState.Leaving);
        }

        private void TryTakeWaitingSeat()
        {
            if (_site.TryReserveWaitingSeat(this, out _waitingSeat)) _machine.Change(CustomerState.Waiting);
            else LeaveNow();
        }

        private void SitOn(Transform seat)
        {
            if (seat == null) return;
            Seating.PlaceOnSeat(transform, animator, seat);
            _motor.Warp(transform.position, transform.rotation);
        }

        // ---- States ---------------------------------------------------------------------------------

        private sealed class WalkState : IState
        {
            private readonly CustomerBrain _owner;
            private readonly Func<Transform> _target;
            private readonly Action _onArrive;
            private readonly CharacterPose _pose;
            private bool _arrived;

            public WalkState(CustomerBrain owner, Func<Transform> target, Action onArrive, CharacterPose pose)
            {
                _owner = owner;
                _target = target;
                _onArrive = onArrive;
                _pose = pose;
            }

            public void Enter()
            {
                _arrived = false;
                var target = _target();
                if (_owner.animator != null) _owner.animator.Pose = _pose;
                if (target != null) _owner._motor.MoveTo(target.position, target.rotation);
            }

            public void Tick(float deltaTime)
            {
                if (_arrived || !_owner._motor.HasArrived) return;
                _arrived = true;
                _onArrive?.Invoke();
            }

            public void Exit() { }
        }

        private sealed class WaitingState : IState
        {
            private readonly CustomerBrain _owner;
            public WaitingState(CustomerBrain owner) { _owner = owner; }

            public void Enter()
            {
                _owner.SitOn(_owner._waitingSeat);
            }

            public void Tick(float deltaTime)
            {
                _owner.Patience01 -= deltaTime / Mathf.Max(1f, _owner.patienceSeconds);
                if (_owner.animator != null)
                    _owner.animator.Mood = _owner.Patience01 < 0.3f ? CharacterMood.Annoyed : CharacterMood.Neutral;
                if (_owner.Patience01 <= 0f) _owner.LeaveNow();
            }

            public void Exit()
            {
                if (_owner.animator != null) _owner.animator.Pose = CharacterPose.Stand;
            }
        }

        private sealed class HoldState : IState
        {
            private readonly CustomerBrain _owner;
            private readonly CharacterPose _pose;
            private readonly bool _talking;

            public HoldState(CustomerBrain owner, CharacterPose pose, bool talking)
            {
                _owner = owner;
                _pose = pose;
                _talking = talking;
            }

            public void Enter()
            {
                if (_pose == CharacterPose.Sit) _owner.SitOn(_owner._chairSeat);
                if (_owner.animator == null) return;
                _owner.animator.Pose = _pose;
                _owner.animator.Talking = _talking;
            }

            public void Tick(float deltaTime) { }

            public void Exit()
            {
                if (_owner.animator != null) _owner.animator.Talking = false;
            }
        }

        private sealed class GoneState : IState
        {
            private readonly CustomerBrain _owner;
            public GoneState(CustomerBrain owner) { _owner = owner; }
            public void Enter() => _owner.gameObject.SetActive(false);
            public void Tick(float deltaTime) { }
            public void Exit() { }
        }
    }
}
