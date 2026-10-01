using System.Collections;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>Hinged door. Can be opened by the player or by cinematics through <see cref="SetOpen"/>.</summary>
    public sealed class SwingDoor : Interactable
    {
        [SerializeField] private Transform hinge;
        [SerializeField] private float openAngle = -95f;
        [SerializeField] private float openDuration = 0.9f;
        [SerializeField] private string labelKey = "interact.front_door";

        private float _closedYaw;
        private Coroutine _routine;

        public bool IsOpen { get; private set; }

        public void Configure(Transform hingeTransform, float angle, string label)
        {
            hinge = hingeTransform;
            openAngle = angle;
            labelKey = label;
        }

        protected override void Awake()
        {
            base.Awake();
            _closedYaw = hinge.localEulerAngles.y;
        }

        public override bool CanInteract(InteractionContext context) => true;

        public override InteractionPrompt GetPrompt(InteractionContext context) =>
            new InteractionPrompt(IsOpen ? InteractionVerb.Close : InteractionVerb.Open, labelKey);

        public override void Interact(InteractionContext context)
        {
            SetOpen(!IsOpen, playSound: true);
        }

        public void SetOpen(bool open, bool playSound, bool instant = false)
        {
            IsOpen = open;
            if (playSound && Services?.Audio != null && Services.Audio.Library != null)
            {
                var clip = open ? Services.Audio.Library.doorOpen : Services.Audio.Library.doorClose;
                Services.Audio.PlaySfxAt(clip, hinge.position, 0.9f, 0.03f);
            }

            float target = _closedYaw + (open ? openAngle : 0f);
            if (_routine != null) StopCoroutine(_routine);
            if (instant || !gameObject.activeInHierarchy)
            {
                hinge.localRotation = Quaternion.Euler(0f, target, 0f);
                return;
            }
            _routine = StartCoroutine(Animate(target, open ? openDuration : openDuration * 0.8f));
        }

        private IEnumerator Animate(float targetYaw, float duration)
        {
            float from = hinge.localEulerAngles.y;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / duration;
                float yaw = Mathf.LerpAngle(from, targetYaw, Easing.OutCubic(t));
                hinge.localRotation = Quaternion.Euler(0f, yaw, 0f);
                yield return null;
            }
            _routine = null;
        }
    }
}
