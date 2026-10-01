using UnityEngine;

namespace BarberSimulator.CameraSystems
{
    /// <summary>
    /// Authored camera move: travels from <see cref="StartPoint"/> to <see cref="EndPoint"/>.
    /// Used by both the main-menu director and the intro sequence.
    /// </summary>
    public sealed class CameraShot : MonoBehaviour
    {
        [SerializeField] private Transform startPoint;
        [SerializeField] private Transform endPoint;
        [SerializeField] private float startFov = 50f;
        [SerializeField] private float endFov = 50f;
        [SerializeField] private float duration = 9f;
        [SerializeField, Range(0f, 1f)] private float handheld = 0.35f;

        public Transform StartPoint => startPoint;
        public Transform EndPoint => endPoint != null ? endPoint : startPoint;
        public float StartFov => startFov;
        public float EndFov => endFov;
        public float Duration => duration;
        public float Handheld => handheld;

        public void Configure(Transform start, Transform end, float fovStart, float fovEnd, float shotDuration, float handheldAmount)
        {
            startPoint = start;
            endPoint = end;
            startFov = fovStart;
            endFov = fovEnd;
            duration = shotDuration;
            handheld = handheldAmount;
        }

        private void OnDrawGizmosSelected()
        {
            if (startPoint == null) return;
            Gizmos.color = new Color(1f, 0.75f, 0.3f);
            Gizmos.DrawWireSphere(startPoint.position, 0.08f);
            Gizmos.DrawRay(startPoint.position, startPoint.forward * 0.6f);
            if (endPoint == null) return;
            Gizmos.DrawLine(startPoint.position, endPoint.position);
            Gizmos.DrawWireSphere(endPoint.position, 0.08f);
            Gizmos.DrawRay(endPoint.position, endPoint.forward * 0.6f);
        }
    }
}
