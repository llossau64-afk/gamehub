using System;
using System.Collections;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>A piece of litter. Collecting it animates it towards the player, then removes it for good.</summary>
    public sealed class TrashPickup : Interactable
    {
        [SerializeField] private string trashId;
        [SerializeField] private string labelKey = "interact.trash";

        private bool _collected;

        public string TrashId => trashId;
        public event Action<TrashPickup> Collected;

        public void Configure(string id, string label)
        {
            trashId = id;
            labelKey = label;
        }

        public override bool CanInteract(InteractionContext context) => !_collected;

        public override InteractionPrompt GetPrompt(InteractionContext context) =>
            new InteractionPrompt(InteractionVerb.PickUp, labelKey);

        public override void Interact(InteractionContext context)
        {
            if (_collected) return;
            _collected = true;

            if (Services?.Audio != null && Services.Audio.Library != null)
                Services.Audio.PlaySfxAt(Services.Audio.Library.trashPickup, transform.position, 0.9f);
            context.Hands?.PlayReach();
            context.Controller?.AddCameraImpulse(new Vector3(0f, -0.15f, 0f));

            foreach (var c in GetComponentsInChildren<Collider>()) c.enabled = false;
            StartCoroutine(CollectRoutine(context.Camera.transform));
        }

        /// <summary>Used when restoring a save: hides without feedback.</summary>
        public void MarkCollectedSilently()
        {
            _collected = true;
            gameObject.SetActive(false);
        }

        private IEnumerator CollectRoutine(Transform target)
        {
            ClearHighlight();
            var start = transform.position;
            var startScale = transform.localScale;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / 0.32f;
                float e = Easing.SmoothStep(t);
                var goal = target.position + target.forward * 0.35f - target.up * 0.25f;
                transform.position = Vector3.Lerp(start, goal, e) + Vector3.up * Mathf.Sin(e * Mathf.PI) * 0.12f;
                transform.localScale = Vector3.Lerp(startScale, startScale * 0.2f, Easing.SmoothStep(t * 1.2f));
                yield return null;
            }

            Collected?.Invoke(this);
            gameObject.SetActive(false);
        }
    }
}
