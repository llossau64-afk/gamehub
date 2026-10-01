using BarberSimulator.Characters;
using BarberSimulator.Economy;
using BarberSimulator.NPC;
using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>The visit states. Each one is small and only knows its own step of the lifecycle.</summary>
    public sealed partial class CustomerBrain
    {
        private void RegisterStates()
        {
            _machine.Add(CustomerState.Spawn, new SpawnState(this));
            _machine.Add(CustomerState.WalkToShop, new WalkState(this, () => _site.DoorOutside, CustomerState.Enter, 0f));
            _machine.Add(CustomerState.Enter, new WalkState(this, () => _site.EntranceInside, CustomerState.CheckAvailability, 0f));
            _machine.Add(CustomerState.CheckAvailability, new CheckAvailabilityState(this));
            _machine.Add(CustomerState.Wait, new WaitState(this));
            _machine.Add(CustomerState.ApproachReception, new WalkState(this, () => _site.ReceptionStand, CustomerState.Dialogue, 0.3f));
            _machine.Add(CustomerState.Dialogue, new DialogueState(this));
            _machine.Add(CustomerState.WalkToChair, new WalkState(this, () => _chair.ApproachPoint, CustomerState.SitDown, 0.3f));
            _machine.Add(CustomerState.SitDown, new SitDownState(this));
            _machine.Add(CustomerState.WaitForPlayer, new WaitForPlayerState(this));
            _machine.Add(CustomerState.Haircut, new HaircutState(this));
            _machine.Add(CustomerState.Result, new ResultState(this));
            _machine.Add(CustomerState.StandUp, new StandUpState(this));
            _machine.Add(CustomerState.Pay, new PayState(this));
            _machine.Add(CustomerState.Leave, new LeaveState(this));
            _machine.Add(CustomerState.Despawn, new DespawnState(this));
        }

        private abstract class CustomerStateBase : IState
        {
            protected readonly CustomerBrain Owner;
            protected CustomerStateBase(CustomerBrain owner) { Owner = owner; }
            public virtual void Enter() { }
            public virtual void Tick(float deltaTime) { }
            public virtual void Exit() { }
        }

        private sealed class SpawnState : CustomerStateBase
        {
            public SpawnState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                var spawn = Owner._site.RandomStreetSpawn(Owner._rng);
                Owner._motor.Warp(spawn.position, spawn.rotation);
                Owner._machine.Change(CustomerState.WalkToShop);
            }
        }

        /// <summary>Walks a nav-graph route, then continues with the next state.</summary>
        private sealed class WalkState : CustomerStateBase
        {
            private readonly System.Func<Transform> _goal;
            private readonly CustomerState _next;
            private readonly float _patienceRate;

            public WalkState(CustomerBrain owner, System.Func<Transform> goal, CustomerState next, float patienceRate) : base(owner)
            {
                _goal = goal;
                _next = next;
                _patienceRate = patienceRate;
            }

            public override void Enter()
            {
                if (Owner.animator != null) Owner.animator.Pose = CharacterPose.Stand;
                Owner.Go(_goal());
            }

            public override void Tick(float deltaTime)
            {
                if (_patienceRate > 0f) Owner.DrainPatience(deltaTime, _patienceRate);
                if (Owner.Arrived) Owner._machine.Change(_next);
            }
        }

        /// <summary>Decides where to go next based on what is free.</summary>
        private sealed class CheckAvailabilityState : CustomerStateBase
        {
            public CheckAvailabilityState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                var site = Owner._site;
                if (!Owner.HasOrdered)
                {
                    if (site.TryClaimReception(Owner)) { Owner._machine.Change(CustomerState.ApproachReception); return; }
                }
                else
                {
                    Owner._chair = site.TryReserveChair(Owner);
                    if (Owner._chair != null)
                    {
                        site.ReleaseWaitingSeat(Owner);
                        Owner._machine.Change(CustomerState.WalkToChair);
                        return;
                    }
                }

                Owner._seat = site.ReserveWaitingSeat(Owner);
                if (Owner._seat != null) { Owner._machine.Change(CustomerState.Wait); return; }

                if (Owner.HasOrdered)
                {
                    // No seat free: stand by the reception and keep checking.
                    Owner._machine.Change(CustomerState.Wait);
                    return;
                }
                Owner.Say(CustomerDialogueSet.Pick(Owner.Profile.dialogue != null ? Owner.Profile.dialogue.leaveImpatient : null, Owner._rng), 2.5f);
                Owner._machine.Change(CustomerState.Leave);
            }
        }

        /// <summary>Sits on a waiting seat (or stands near the counter) until the reception or a chair frees up.</summary>
        private sealed class WaitState : CustomerStateBase
        {
            private enum Phase { Walking, Sitting, Seated, Standing }
            private Phase _phase;
            private float _checkTimer;
            private float _idleTimer;

            public WaitState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                _checkTimer = 1f;
                _idleTimer = Random.Range(4f, 9f);
                if (Owner._seat != null)
                {
                    _phase = Phase.Walking;
                    Owner.Go(Owner._seat.ApproachPoint);
                }
                else
                {
                    _phase = Phase.Seated;
                    Owner.Go(Owner._site.EntranceInside);
                }
            }

            public override void Tick(float deltaTime)
            {
                Owner.DrainPatience(deltaTime, 1f);
                switch (_phase)
                {
                    case Phase.Walking:
                        if (!Owner.Arrived) return;
                        _phase = Phase.Sitting;
                        Owner.StartCoroutine(Owner.SitRoutine(Owner._seat.SeatPoint, () => _phase = Phase.Seated));
                        return;
                    case Phase.Seated:
                        _idleTimer -= deltaTime;
                        if (_idleTimer <= 0f && Owner.animator != null)
                        {
                            Owner.animator.Trigger("lookaround");
                            _idleTimer = Random.Range(6f, 12f);
                            // Now and then a customer chats while waiting (never the silent tutorial customer).
                            var set = Owner.Profile.dialogue;
                            if (!Owner.IsTutorial && set != null && Random.value < 0.3f)
                                Owner.Say(CustomerDialogueSet.Pick(set.smallTalk, Owner._rng), 3f);
                        }
                        _checkTimer -= deltaTime;
                        if (_checkTimer > 0f) return;
                        _checkTimer = 1f;
                        if (CanProceed()) Proceed();
                        return;
                }
            }

            private bool CanProceed()
            {
                var site = Owner._site;
                if (!Owner.HasOrdered) return site.TryClaimReception(Owner);
                Owner._chair = site.TryReserveChair(Owner);
                return Owner._chair != null;
            }

            private void Proceed()
            {
                var next = Owner.HasOrdered ? CustomerState.WalkToChair : CustomerState.ApproachReception;
                if (Owner._seat == null) { Owner._machine.Change(next); return; }
                _phase = Phase.Standing;
                Owner.StartCoroutine(Owner.StandRoutine(Owner._seat.ApproachPoint, () =>
                {
                    Owner._site.ReleaseWaitingSeat(Owner);
                    Owner._seat = null;
                    Owner._machine.Change(next);
                }));
            }
        }

        /// <summary>Stands at the counter until the player talks to them.</summary>
        private sealed class DialogueState : CustomerStateBase
        {
            private float _callTimer;

            public DialogueState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                _callTimer = 1.2f;
                if (Owner.animator != null) Owner.animator.ClearLookTarget();
            }

            public override void Tick(float deltaTime)
            {
                if (Owner._conversationStarted) return;
                Owner.DrainPatience(deltaTime, 0.6f);
                _callTimer -= deltaTime;
                if (_callTimer > 0f) return;
                // A friendly nudge so the player notices someone is waiting.
                _callTimer = 25f;
                Owner.Say("customer.call_attention", 2.2f);
                Owner._services.Toasts?.ShowToast(Owner._services.Localization.Get("toast.customer_waiting"));
            }
        }

        private sealed class SitDownState : CustomerStateBase
        {
            public SitDownState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                Owner.StartCoroutine(Owner.SitRoutine(Owner._chair.SeatPoint, () =>
                {
                    Owner._chair.MarkSeated(Owner);
                    var library = Owner._services.Audio != null ? Owner._services.Audio.Library : null;
                    if (library != null)
                    {
                        Owner._services.Audio.PlaySfxAt(library.chairCreak, Owner._chair.transform.position, 0.6f);
                        Owner._services.Audio.PlaySfxAt(library.capeSnap, Owner._chair.transform.position, 0.6f);
                    }
                    Owner._machine.Change(CustomerState.WaitForPlayer);
                }));
            }
        }

        private sealed class WaitForPlayerState : CustomerStateBase
        {
            private float _idleTimer;
            public WaitForPlayerState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                _idleTimer = 5f;
                if (Owner.animator != null && Owner._chair.MirrorLookPoint != null) Owner.animator.SetLookTarget(Owner._chair.MirrorLookPoint.position);
            }

            public override void Tick(float deltaTime)
            {
                Owner.DrainPatience(deltaTime, 0.5f);
                _idleTimer -= deltaTime;
                if (_idleTimer > 0f || Owner.animator == null) return;
                _idleTimer = Random.Range(7f, 12f);
                Owner.animator.Trigger("lookaround");
            }
        }

        private sealed class HaircutState : CustomerStateBase
        {
            public HaircutState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                // Keep the head still while being cut; tiny idle motion only.
                if (Owner.animator != null && Owner._chair.MirrorLookPoint != null) Owner.animator.SetLookTarget(Owner._chair.MirrorLookPoint.position);
            }
        }

        /// <summary>Looks in the mirror and reacts to the result.</summary>
        private sealed class ResultState : CustomerStateBase
        {
            private float _timer;
            private bool _reacted;
            public ResultState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                _timer = 0f;
                _reacted = false;
                if (Owner.animator != null && Owner._chair.MirrorLookPoint != null) Owner.animator.SetLookTarget(Owner._chair.MirrorLookPoint.position);
            }

            public override void Tick(float deltaTime)
            {
                _timer += deltaTime;
                if (!_reacted && _timer > 1.1f)
                {
                    _reacted = true;
                    int stars = Owner.LastResult.Stars;
                    var set = Owner.Profile.dialogue;
                    string[] pool = stars >= 4 ? set?.reactionGreat : stars == 3 ? set?.reactionOkay : set?.reactionBad;
                    Owner.Say(CustomerDialogueSet.Pick(pool, Owner._rng), 2.8f);
                    if (Owner.animator != null)
                    {
                        Owner.animator.Trigger(stars >= 4 ? "happy" : stars == 3 ? "nod" : "disappointed");
                        Owner.animator.Mood = stars >= 4 ? CharacterMood.Happy : stars <= 2 ? CharacterMood.Annoyed : CharacterMood.Neutral;
                    }
                    var library = Owner._services.Audio != null ? Owner._services.Audio.Library : null;
                    if (library != null) Owner._services.Audio.PlayUI(stars >= 3 ? library.reviewGood : library.reviewBad, 0.6f);
                }
                if (_timer > 4f) Owner._machine.Change(CustomerState.StandUp);
            }
        }

        private sealed class StandUpState : CustomerStateBase
        {
            public StandUpState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                Owner.StartCoroutine(Owner.StandRoutine(Owner._chair.ApproachPoint, () =>
                {
                    Owner._chair.Release(Owner);
                    Owner._chair = null;
                    Owner._machine.Change(CustomerState.Pay);
                }));
            }
        }

        /// <summary>Walks to the register and pays; the review appears when the money changes hands.</summary>
        private sealed class PayState : CustomerStateBase
        {
            private bool _paid;
            private float _timer;
            public PayState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                _paid = false;
                _timer = 0f;
                if (Owner.animator != null) Owner.animator.ClearLookTarget();
                Owner.Go(Owner._site.RegisterStand);
            }

            public override void Tick(float deltaTime)
            {
                if (!Owner.Arrived) return;
                _timer += deltaTime;
                if (!_paid && _timer > 0.3f)
                {
                    _paid = true;
                    Pay();
                }
                if (_timer > 2.2f) Owner._machine.Change(CustomerState.Leave);
            }

            private void Pay()
            {
                var services = Owner._services;
                var result = Owner.LastResult;
                if (Owner.animator != null) Owner.animator.Trigger("pay");

                int stars = result.Stars;
                // Strict reviewers shave a star off borderline results.
                // VIPs are stricter: their strictness is raised, and the borderline for a lost star is a little higher.
                float strictness = Owner.Profile.reviewStrictness * (Owner.IsVip ? 1.2f : 1f);
                if (strictness > 1.15f && result.Total < (Owner.IsVip ? 0.85f : 0.8f)) stars = Mathf.Max(1, stars - 1);

                Platform.PlatformHooks.HappyTime(stars);
                var payment = PaymentCalculator.Calculate(Owner.Request.NameKey, Owner.Request.BasePrice, stars, result.Total,
                    Owner.Profile.budget, Owner.Profile.tipChance, Owner.Patience01, services.Economy.Reputation, Owner._rng,
                    services.Upgrades != null ? services.Upgrades.TipMultiplier : 1f,
                    services.Upgrades != null ? services.Upgrades.ReputationGainMultiplier : 1f,
                    Owner.IsVip, services.Streak != null ? services.Streak.PreviewTipMultiplier(stars) : 1f);
                services.Economy.ReceivePayment(payment);

                var library = services.Audio != null ? services.Audio.Library : null;
                if (library != null)
                {
                    services.Audio.PlaySfxAt(library.cashRegister, Owner._site.RegisterStand.position, 0.8f);
                    if (payment.Tip > 0) services.Audio.PlaySfxAt(library.coins, Owner._site.RegisterStand.position, 0.7f);
                }

                string quote = services.Localization.Get(ReviewText.KeyFor(stars, result.MainIssue, Owner._rng));
                services.Reviews?.ShowReview(payment, quote);
                Owner.Say(CustomerDialogueSet.Pick(Owner.Profile.dialogue != null ? Owner.Profile.dialogue.thanks : null, Owner._rng), 2f);
                services.Objectives?.Signal(Objectives.ObjectiveSignals.CustomerServed);
            }
        }

        private sealed class LeaveState : CustomerStateBase
        {
            private int _leg;
            public LeaveState(CustomerBrain owner) : base(owner) { }

            public override void Enter()
            {
                _leg = 0;
                Owner._site.ReleaseReception(Owner);
                Owner._site.ReleaseWaitingSeat(Owner);
                if (Owner._chair != null) { Owner._chair.Release(Owner); Owner._chair = null; }
                if (Owner.animator != null) { Owner.animator.Pose = CharacterPose.Stand; Owner.animator.ClearLookTarget(); }
                Owner.Go(Owner._site.DoorOutside);
            }

            public override void Tick(float deltaTime)
            {
                if (!Owner.Arrived) return;
                if (_leg == 0)
                {
                    _leg = 1;
                    Owner.Go(Owner._site.RandomStreetSpawn(Owner._rng));
                    return;
                }
                Owner._machine.Change(CustomerState.Despawn);
            }
        }

        private sealed class DespawnState : CustomerStateBase
        {
            public DespawnState(CustomerBrain owner) : base(owner) { }
            public override void Enter() => Owner.FinishVisit();
        }
    }
}
