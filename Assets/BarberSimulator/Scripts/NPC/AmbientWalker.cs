using System.Collections;
using System.Collections.Generic;
using BarberSimulator.Characters;
using BarberSimulator.Interaction;
using UnityEngine;

namespace BarberSimulator.NPC
{
    /// <summary>
    /// Main-menu background life: a passer-by walks in through the front door, waits at the counter for a moment
    /// and leaves again, on a loop with random pauses. Purely visual; disabled together with the menu dressing.
    /// </summary>
    public sealed class AmbientWalker : MonoBehaviour
    {
        [SerializeField] private NpcMotor motor;
        [SerializeField] private ProceduralCharacterAnimator animator;
        [SerializeField] private SwingDoor door;
        [Tooltip("Hidden start outside, then the waypoints into the shop; the route is walked back out.")]
        [SerializeField] private List<Transform> route = new List<Transform>();
        [SerializeField] private Transform lookTarget;
        [Tooltip("Index of the route point right behind the door (the door opens before and closes after it).")]
        [SerializeField] private int doorIndex = 1;
        [SerializeField] private Vector2 pauseOutside = new Vector2(5f, 11f);
        [SerializeField] private Vector2 pauseInside = new Vector2(4f, 7f);

        public void Configure(NpcMotor npcMotor, ProceduralCharacterAnimator characterAnimator, SwingDoor frontDoor, List<Transform> path, Transform look)
        {
            motor = npcMotor;
            animator = characterAnimator;
            door = frontDoor;
            route = path;
            lookTarget = look;
        }

        private void OnEnable()
        {
            if (motor == null || route.Count < 2) return;
            motor.Warp(route[0].position, route[0].rotation);
            StartCoroutine(Loop());
        }

        private void OnDisable()
        {
            StopAllCoroutines();
            if (door != null && door.IsOpen) door.SetOpen(false, playSound: false, instant: true);
        }

        private IEnumerator Loop()
        {
            // Stagger the first entrance so the opening menu shot is calm.
            yield return new WaitForSeconds(Random.Range(3f, 6f));
            while (true)
            {
                for (int i = 1; i < route.Count; i++) yield return Walk(i, true);
                if (animator != null && lookTarget != null) animator.SetLookTarget(lookTarget.position);
                if (animator != null) animator.Trigger("gesture");
                yield return new WaitForSeconds(Random.Range(pauseInside.x, pauseInside.y));
                if (animator != null) animator.ClearLookTarget();
                for (int i = route.Count - 2; i >= 0; i--) yield return Walk(i, false);
                yield return new WaitForSeconds(Random.Range(pauseOutside.x, pauseOutside.y));
            }
        }

        private IEnumerator Walk(int index, bool inbound)
        {
            bool passesDoor = door != null && ((inbound && index == doorIndex) || (!inbound && index == doorIndex - 1));
            if (passesDoor && !door.IsOpen)
            {
                door.SetOpen(true, playSound: true);
                yield return new WaitForSeconds(0.45f);
            }
            motor.MoveTo(route[index].position, route[index].rotation);
            while (!motor.HasArrived) yield return null;
            if (passesDoor) door.SetOpen(false, playSound: true);
        }
    }
}
