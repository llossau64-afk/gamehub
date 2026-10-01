using System.Collections;
using BarberSimulator.Core;
using BarberSimulator.Interaction;
using UnityEngine;

namespace BarberSimulator.Workday
{
    /// <summary>
    /// The Open/Closed sign next to the front door. Flipping it opens the shop for the day; it flips back to
    /// CLOSED at closing time. The board is a double-sided plaque that turns around its vertical axis.
    /// </summary>
    public sealed class ShopSign : Interactable
    {
        [SerializeField] private Transform board;
        [SerializeField] private float flipDuration = 0.55f;
        [SerializeField] private string labelKey = "interact.shop_sign";
        [SerializeField] private string blockedMessageKey = "toast.sign_prepare";

        private DayCycleService _day;
        private Coroutine _flip;

        public void Configure(Transform boardTransform)
        {
            board = boardTransform;
        }

        /// <summary>Connects the sign to the day cycle; its face always follows the shop state.</summary>
        public void Attach(DayCycleService day)
        {
            if (_day != null) _day.PhaseChanged -= OnPhaseChanged;
            _day = day;
            _day.PhaseChanged += OnPhaseChanged;
            Show(_day.Phase == DayPhase.Open, instant: true);
        }

        private void OnDestroy()
        {
            if (_day != null) _day.PhaseChanged -= OnPhaseChanged;
        }

        private void OnPhaseChanged(DayPhase previous, DayPhase phase) => Show(phase == DayPhase.Open, instant: false);

        public override bool CanInteract(InteractionContext context) => _day != null && _day.Phase == DayPhase.Closed;

        public override InteractionPrompt GetPrompt(InteractionContext context)
        {
            if (_day == null) return new InteractionPrompt(InteractionVerb.Locked, labelKey + ".closed");
            switch (_day.Phase)
            {
                case DayPhase.Closed:
                    return _day.IsOpenGateClear
                        ? new InteractionPrompt(InteractionVerb.Open, labelKey + ".open")
                        : new InteractionPrompt(InteractionVerb.Locked, labelKey + ".prepare");
                case DayPhase.Open:
                    return new InteractionPrompt(InteractionVerb.Use, labelKey + ".is_open");
                case DayPhase.Closing:
                    return new InteractionPrompt(InteractionVerb.Use, labelKey + ".closing");
                default:
                    return new InteractionPrompt(InteractionVerb.Use, labelKey + ".closed");
            }
        }

        public override void Interact(InteractionContext context)
        {
            if (_day == null || _day.Phase != DayPhase.Closed) return;
            if (!_day.IsOpenGateClear)
            {
                if (Services?.Toasts != null && Services.Localization != null)
                    Services.Toasts.ShowToast(Services.Localization.Get(blockedMessageKey));
                return;
            }

            if (Services?.Audio != null && Services.Audio.Library != null)
                Services.Audio.PlaySfxAt(Services.Audio.Library.doorUnlock, transform.position, 0.8f, 0.05f);
            context.Hands?.PlayReach();
            _day.TryOpenShop();
        }

        /// <summary>The board faces the shop with CLOSED at rest (yaw 0) and with OPEN after a half turn.</summary>
        private void Show(bool open, bool instant)
        {
            if (board == null) return;
            float target = open ? 180f : 0f;
            if (_flip != null) StopCoroutine(_flip);
            if (instant || !gameObject.activeInHierarchy)
            {
                board.localRotation = Quaternion.Euler(0f, target, 0f);
                return;
            }
            _flip = StartCoroutine(Flip(target));
        }

        private IEnumerator Flip(float targetYaw)
        {
            float from = board.localEulerAngles.y;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.unscaledDeltaTime / Mathf.Max(0.05f, flipDuration);
                float swing = Mathf.Sin(Mathf.Clamp01(t) * Mathf.PI) * 6f;
                board.localRotation = Quaternion.Euler(0f, Mathf.LerpAngle(from, targetYaw, Easing.OutBack(t, 1.2f)) + swing, 0f);
                yield return null;
            }
            board.localRotation = Quaternion.Euler(0f, targetYaw, 0f);
            _flip = null;
        }
    }
}
