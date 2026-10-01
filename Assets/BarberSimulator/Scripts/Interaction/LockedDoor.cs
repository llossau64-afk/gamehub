using System.Collections;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>
    /// Door into an expansion. Rattles and explains itself while locked; once <see cref="Shop.ExpansionArea"/>
    /// unlocks it (shop upgrade) the leaf swings open for good and the doorway becomes walkable.
    /// </summary>
    public sealed class LockedDoor : Interactable
    {
        [SerializeField] private Transform rattleTarget;
        [SerializeField] private string labelKey = "interact.expansion_door";
        [SerializeField] private string messageKey = "toast.expansion_locked";
        [Tooltip("Hinge position on the leaf, in leaf-local X (the leaf is centred on its pivot).")]
        [SerializeField] private float hingeLocalX = -0.45f;
        [SerializeField] private float openAngle = 100f;

        private Coroutine _rattle;
        private Vector3 _restLocalPosition;
        private bool _unlocked;

        public bool Unlocked
        {
            get => _unlocked;
            set
            {
                if (_unlocked == value) return;
                _unlocked = value;
                if (value) SwingOpen();
            }
        }

        public void Configure(Transform target, string label, string message)
        {
            rattleTarget = target;
            labelKey = label;
            messageKey = message;
        }

        protected override void Awake()
        {
            base.Awake();
            if (rattleTarget == null) rattleTarget = transform;
            _restLocalPosition = rattleTarget.localPosition;
        }

        public override bool CanInteract(InteractionContext context) => !Unlocked;

        public override InteractionPrompt GetPrompt(InteractionContext context) =>
            new InteractionPrompt(InteractionVerb.Locked, labelKey);

        public override void Interact(InteractionContext context)
        {
            if (Services?.Audio != null && Services.Audio.Library != null)
                Services.Audio.PlaySfxAt(Services.Audio.Library.doorUnlock, rattleTarget.position, 0.55f, 0.1f);
            if (Services?.Toasts != null && Services.Localization != null)
                Services.Toasts.ShowToast(Services.Localization.Get(messageKey));

            if (_rattle != null) StopCoroutine(_rattle);
            _rattle = StartCoroutine(Rattle());
        }

        /// <summary>Pushes the leaf open around its hinge and removes the blocking collider.</summary>
        private void SwingOpen()
        {
            var leaf = rattleTarget != null ? rattleTarget : transform;
            var hinge = leaf.TransformPoint(new Vector3(hingeLocalX, 0f, 0f));
            leaf.RotateAround(hinge, Vector3.up, openAngle);
            foreach (var c in GetComponents<Collider>()) c.enabled = false;
        }

        private IEnumerator Rattle()
        {
            float t = 0f;
            while (t < 0.35f)
            {
                t += Time.deltaTime;
                float strength = (1f - t / 0.35f) * 0.006f;
                rattleTarget.localPosition = _restLocalPosition + new Vector3(Mathf.Sin(t * 90f) * strength, 0f, Mathf.Sin(t * 70f) * strength * 0.5f);
                yield return null;
            }
            rattleTarget.localPosition = _restLocalPosition;
            _rattle = null;
        }
    }
}
