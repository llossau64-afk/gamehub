using BarberSimulator.Characters;
using UnityEngine;

namespace BarberSimulator.NPC
{
    /// <summary>Background character for the menu scene (barber at work, customer in the chair, someone waiting).</summary>
    public sealed class AmbientNpc : MonoBehaviour
    {
        [SerializeField] private ProceduralCharacterAnimator animator;
        [SerializeField] private CharacterPose pose = CharacterPose.Stand;
        [SerializeField] private Transform lookTarget;
        [SerializeField] private bool talking;
        [SerializeField] private float talkToggleSeconds = 6f;
        [Tooltip("Optional seat (SeatPoint of a chair) used when the pose is Sit.")]
        [SerializeField] private Transform seat;
        [Tooltip("Barber pose with raised arms, as if cutting.")]
        [SerializeField] private bool cutting;

        private float _timer;

        public void Configure(ProceduralCharacterAnimator characterAnimator, CharacterPose characterPose, Transform look, bool talks, Transform seatPoint = null, bool cutting = false)
        {
            seat = seatPoint;
            this.cutting = cutting;
            animator = characterAnimator;
            pose = characterPose;
            lookTarget = look;
            talking = talks;
        }

        private void OnEnable()
        {
            if (animator == null) return;
            animator.Pose = pose;
            animator.CuttingPose = cutting;
            if (pose == CharacterPose.Sit && seat != null) Seating.PlaceOnSeat(transform, animator, seat);
            if (lookTarget != null) animator.SetLookTarget(lookTarget.position);
            _timer = Random.Range(0f, talkToggleSeconds);
        }

        private void Update()
        {
            if (!talking || animator == null) return;
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;
            // Alternate short chats with silences so the scene breathes.
            animator.Talking = !animator.Talking;
            _timer = animator.Talking ? Random.Range(2.5f, 5f) : Random.Range(3f, 7f);
            if (animator.Talking && Random.value > 0.5f) animator.Trigger("gesture");
        }
    }
}
