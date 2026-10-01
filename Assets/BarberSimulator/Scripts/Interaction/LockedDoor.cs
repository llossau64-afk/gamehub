using System.Collections;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>
    /// Door into a future expansion. Rattles and explains itself; the expansion system will unlock it later
    /// through <see cref="Shop.ExpansionArea"/>.
    /// </summary>
    public sealed class LockedDoor : Interactable
    {
        [SerializeField] private Transform rattleTarget;
        [SerializeField] private string labelKey = "interact.expansion_door";
        [SerializeField] private string messageKey = "toast.expansion_locked";

        private Coroutine _rattle;
        private Vector3 _restLocalPosition;

        public bool Unlocked { get; set; }

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
