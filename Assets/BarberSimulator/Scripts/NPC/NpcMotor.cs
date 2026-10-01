using BarberSimulator.Characters;
using UnityEngine;

namespace BarberSimulator.NPC
{
    /// <summary>
    /// Walks an NPC towards a destination on the flat shop floor and feeds speed to the animator.
    /// The shop is small and authored, so straight segments between waypoints replace a NavMesh for now.
    ///
    /// Local avoidance (cheap, allocation-free, O(n²) over the few active agents): every enabled motor is in a static
    /// list. A walking agent that has another agent less than <see cref="BlockDistance"/> ahead slows down or stops,
    /// and sidesteps by at most <see cref="MaxLateralOffset"/> from its path segment. Of two agents that block each
    /// other the one with less path left waits (lower id breaks a tie). Waiting is always bounded: after
    /// <see cref="YieldTimeout"/> the agent passes through for a while, so a crowd can never deadlock. While the
    /// player is walking, agents pause within <see cref="PlayerYieldDistance"/> of them so the player is never boxed in.
    /// </summary>
    public sealed class NpcMotor : MonoBehaviour
    {
        [SerializeField] private float walkSpeed = 1.15f;
        [SerializeField] private float turnSpeed = 300f;
        [SerializeField] private float arriveDistance = 0.05f;
        [SerializeField] private ProceduralCharacterAnimator animator;

        // ---- avoidance tuning (metres / seconds)
        public const float BlockDistance = 0.6f;        // another agent this close ahead holds us back
        public const float SteerDistance = 0.9f;        // ...and this close ahead makes us sidestep
        public const float BodyHalfWidth = 0.4f;        // how far beside our line another agent still counts as in the way
        public const float MaxLateralOffset = 0.25f;    // never further than this from the path segment
        public const float PlayerYieldDistance = 0.8f;
        public const float YieldTimeout = 2.5f;         // waiting longer than this -> pass through
        public const float PassThroughTime = 3f;
        public const float PlayerYieldTimeout = 4f;
        private const float LateralSpeed = 0.5f;

        private static readonly System.Collections.Generic.List<NpcMotor> Agents = new System.Collections.Generic.List<NpcMotor>(8);
        private static int _nextId;

        /// <summary>The walking player (set by the first-person controller). Agents only give way while <see cref="PlayerInControl"/>.</summary>
        public static Transform Player { get; set; }
        public static bool PlayerInControl { get; set; }
        public static int ActiveAgentCount => Agents.Count;

        private readonly System.Collections.Generic.List<Vector3> _path = new System.Collections.Generic.List<Vector3>();
        private Vector3 _destination;
        private Vector3 _segmentStart;
        private Quaternion? _finalFacing;
        private float _currentSpeed;
        private int _id;
        private float _remaining;       // path length left, refreshed every frame
        private float _lateralOffset;   // signed distance from the segment line, + = right
        private float _blockedTime;
        private float _passThroughTimer;
        private float _playerWaitTime;
        private float _playerIgnoreTimer;

        public int AgentId => _id;
        /// <summary>True while avoidance is holding this agent back (another agent or the player is in the way).</summary>
        public bool IsYielding { get; private set; }
        public float LateralOffset => _lateralOffset;

        public bool HasArrived { get; private set; } = true;

        private void OnEnable()
        {
            _id = ++_nextId;
            if (!Agents.Contains(this)) Agents.Add(this);
            _segmentStart = transform.position;
            ResetAvoidance();
        }

        private void OnDisable()
        {
            Agents.Remove(this);
            ResetAvoidance();
        }

        private void ResetAvoidance()
        {
            _lateralOffset = 0f;
            _blockedTime = 0f;
            _passThroughTimer = 0f;
            _playerWaitTime = 0f;
            _playerIgnoreTimer = 0f;
            IsYielding = false;
        }

        public void SetAnimator(ProceduralCharacterAnimator characterAnimator) => animator = characterAnimator;

        /// <summary>Follows a list of waypoints, then faces <paramref name="faceOnArrival"/> if given.</summary>
        public void FollowPath(System.Collections.Generic.List<Vector3> points, Quaternion? faceOnArrival = null)
        {
            _path.Clear();
            if (points == null || points.Count == 0) { HasArrived = true; return; }
            _path.AddRange(points);
            _segmentStart = transform.position;
            _destination = _path[0];
            _path.RemoveAt(0);
            _finalFacing = faceOnArrival;
            HasArrived = false;
        }

        public float Speed => _currentSpeed;

        public void MoveTo(Vector3 destination, Quaternion? faceOnArrival = null)
        {
            _path.Clear();
            _segmentStart = transform.position;
            _destination = destination;
            _finalFacing = faceOnArrival;
            HasArrived = false;
        }

        public void Warp(Vector3 position, Quaternion rotation)
        {
            _path.Clear();
            transform.SetPositionAndRotation(position, rotation);
            _destination = position;
            _segmentStart = position;
            HasArrived = true;
            _currentSpeed = 0f;
            ResetAvoidance();
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            var position = transform.position;
            var toTarget = _destination - position;
            toTarget.y = 0f;
            float distance = toTarget.magnitude;

            if (!HasArrived)
            {
                bool lastLeg = _path.Count == 0;
                _remaining = distance + PathLengthLeft();
                var forward = distance > 0.001f ? toTarget / distance : transform.forward;

                // Ease into and out of walking.
                float targetSpeed = lastLeg && distance < 0.35f ? walkSpeed * Mathf.Max(0.35f, distance / 0.35f) : walkSpeed;
                bool hold = Avoid(position, forward, dt, lastLeg && distance < 0.35f, ref targetSpeed, out float lateralTarget);
                IsYielding = hold;
                // A held agent brakes harder so it stops before it reaches whoever is in front.
                _currentSpeed = Mathf.MoveTowards(_currentSpeed, hold ? 0f : targetSpeed, dt * (hold ? 8f : 2.5f));

                if (distance > 0.001f)
                {
                    var desired = Quaternion.LookRotation(forward, Vector3.up);
                    transform.rotation = Quaternion.RotateTowards(transform.rotation, desired, turnSpeed * dt);
                }

                float step = Mathf.Min(distance, _currentSpeed * dt);
                var newPosition = position + (distance > 0.001f ? forward * step : Vector3.zero);

                // Sidestep: drift towards the lateral target, then keep the result within reach of the path segment.
                if (_currentSpeed > 0.05f || lateralTarget != 0f)
                {
                    var right = new Vector3(forward.z, 0f, -forward.x);
                    float wanted = Mathf.Clamp(lateralTarget - _lateralOffset, -LateralSpeed * dt, LateralSpeed * dt);
                    newPosition += right * wanted;
                }
                newPosition = ClampToSegment(newPosition);
                _lateralOffset = SignedOffset(newPosition);
                transform.position = newPosition;

                if (distance <= (lastLeg ? arriveDistance : 0.25f))
                {
                    if (lastLeg) { HasArrived = true; ResetAvoidance(); }
                    else
                    {
                        _segmentStart = _destination;
                        _destination = _path[0];
                        _path.RemoveAt(0);
                    }
                }
            }
            else
            {
                _remaining = 0f;
                IsYielding = false;
                _currentSpeed = Mathf.MoveTowards(_currentSpeed, 0f, dt * 4f);
                if (_finalFacing.HasValue)
                    transform.rotation = Quaternion.RotateTowards(transform.rotation, _finalFacing.Value, turnSpeed * 0.6f * dt);
            }

            if (animator != null) animator.WalkSpeed = _currentSpeed;
        }

        private float PathLengthLeft()
        {
            float length = 0f;
            var previous = _destination;
            for (int i = 0; i < _path.Count; i++)
            {
                var next = _path[i];
                var delta = next - previous;
                delta.y = 0f;
                length += delta.magnitude;
                previous = next;
            }
            return length;
        }

        // ---------------------------------------------------------------- local avoidance

        /// <summary>
        /// Looks at the other agents and the player. Returns true when this agent must stand still this frame;
        /// may lower <paramref name="targetSpeed"/> (queueing behind a slower walker) and sets the sidestep target.
        /// </summary>
        private bool Avoid(Vector3 position, Vector3 forward, float dt, bool finalApproach, ref float targetSpeed, out float lateralTarget)
        {
            lateralTarget = 0f;
            if (_passThroughTimer > 0f) _passThroughTimer -= dt;
            if (_playerIgnoreTimer > 0f) _playerIgnoreTimer -= dt;

            // ---- the player always has right of way while walking around
            bool holdForPlayer = false;
            if (PlayerInControl && Player != null && _playerIgnoreTimer <= 0f)
            {
                var toPlayer = Player.position - position;
                toPlayer.y = 0f;
                float playerDistance = toPlayer.magnitude;
                if (playerDistance < PlayerYieldDistance && Vector3.Dot(toPlayer, forward) > -0.2f * playerDistance)
                {
                    _playerWaitTime += dt;
                    if (_playerWaitTime > PlayerYieldTimeout)
                    {
                        _playerIgnoreTimer = PassThroughTime;
                        _playerWaitTime = 0f;
                    }
                    else holdForPlayer = true;
                }
                else _playerWaitTime = Mathf.Max(0f, _playerWaitTime - dt);
            }
            else if (_playerIgnoreTimer <= 0f) _playerWaitTime = 0f;

            // ---- other agents
            bool blocked = false;
            float steer = 0f;
            var right = new Vector3(forward.z, 0f, -forward.x);
            for (int i = 0; i < Agents.Count; i++)
            {
                var other = Agents[i];
                if (other == this || other == null) continue;
                var offset = other.transform.position - position;
                if (Mathf.Abs(offset.y) > 1.5f) continue;
                offset.y = 0f;
                float ahead = Vector3.Dot(offset, forward);
                if (ahead < 0f || ahead > SteerDistance) continue;
                float side = Vector3.Dot(offset, right);
                if (Mathf.Abs(side) > BodyHalfWidth) continue;

                float alignment = Vector3.Dot(other.transform.forward, forward);
                // Sidestep away from whoever is ahead; closer = stronger. Dead centre: walkers meeting head-on both
                // take their own right, walkers going the same way split by id so overlapping agents come apart.
                float away = side > 0.05f ? -1f : side < -0.05f ? 1f : (alignment < 0f || _id < other._id ? 1f : -1f);
                steer += away * (1f - Mathf.Clamp01(ahead / SteerDistance));

                // Beside us (not in front) or inside the pass-through window: steer only.
                if (ahead > BlockDistance || ahead < 0.15f || _passThroughTimer > 0f) continue;
                // Someone standing or sitting there is walked around, never waited for.
                if (other.HasArrived) continue;

                if (alignment > 0.5f)
                {
                    // Same direction: queue behind, matching the leader's pace and stopping short of them.
                    targetSpeed = Mathf.Min(targetSpeed, Mathf.Max(0f, other._currentSpeed));
                    if (ahead < BlockDistance * 0.6f) blocked = true;
                }
                else
                {
                    // Head-on or crossing: one of us waits, the other walks on. Less path left waits; the lower id breaks ties.
                    float difference = _remaining - other._remaining;
                    if (difference < -0.2f || (difference <= 0.2f && _id < other._id)) blocked = true;
                }
            }

            if (!finalApproach) lateralTarget = Mathf.Clamp(steer, -1f, 1f) * MaxLateralOffset;

            if (blocked)
            {
                _blockedTime += dt;
                if (_blockedTime > YieldTimeout)
                {
                    _passThroughTimer = PassThroughTime;
                    _blockedTime = 0f;
                    blocked = false;
                }
            }
            else _blockedTime = Mathf.Max(0f, _blockedTime - dt);

            return blocked || holdForPlayer;
        }

        private Vector3 ClampToSegment(Vector3 point)
        {
            var closest = ClosestOnSegment(point);
            var away = point - closest;
            away.y = 0f;
            float length = away.magnitude;
            if (length <= MaxLateralOffset) return point;
            var clamped = closest + away / length * MaxLateralOffset;
            clamped.y = point.y;
            return clamped;
        }

        private Vector3 ClosestOnSegment(Vector3 point)
        {
            var a = _segmentStart;
            var b = _destination;
            var ab = b - a;
            ab.y = 0f;
            float lengthSquared = ab.sqrMagnitude;
            if (lengthSquared < 1e-6f) return new Vector3(b.x, point.y, b.z);
            var ap = point - a;
            ap.y = 0f;
            float t = Mathf.Clamp01(Vector3.Dot(ap, ab) / lengthSquared);
            return new Vector3(a.x + ab.x * t, point.y, a.z + ab.z * t);
        }

        private float SignedOffset(Vector3 point)
        {
            var closest = ClosestOnSegment(point);
            var line = _destination - _segmentStart;
            line.y = 0f;
            if (line.sqrMagnitude < 1e-6f) return 0f;
            line.Normalize();
            var right = new Vector3(line.z, 0f, -line.x);
            return Vector3.Dot(point - closest, right);
        }
    }
}
