using BarberSimulator.Objectives;
using BarberSimulator.Player;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>
    /// The barber's workstation. In Phase 1 the player inspects the tools; the haircut phase will turn this into
    /// the entry point for serving a seated customer.
    /// </summary>
    public sealed class BarberStation : Interactable
    {
        [SerializeField] private string labelKey = "interact.barber_station";
        [SerializeField] private string inspectMessageKey = "toast.station_inspected";
        [SerializeField] private float showcaseSeconds = 2.2f;

        private float _cooldownUntil;

        public override bool CanInteract(InteractionContext context) => Time.time >= _cooldownUntil;

        public override InteractionPrompt GetPrompt(InteractionContext context) =>
            new InteractionPrompt(InteractionVerb.Inspect, labelKey);

        public override void Interact(InteractionContext context)
        {
            _cooldownUntil = Time.time + showcaseSeconds + 0.8f;

            context.Hands?.PlayToolShowcase(HandToolType.Clipper, showcaseSeconds);
            if (Services?.Audio != null && Services.Audio.Library != null)
            {
                Services.Audio.PlaySfxAt(Services.Audio.Library.inspectTools, transform.position, 0.8f);
                Services.Audio.PlaySfx(Services.Audio.Library.clipperBuzz, 0.35f);
            }
            if (Services?.Toasts != null && Services.Localization != null)
                Services.Toasts.ShowToast(Services.Localization.Get(inspectMessageKey));

            Services?.Objectives?.Signal(ObjectiveSignals.StationInspected);
        }
    }
}
