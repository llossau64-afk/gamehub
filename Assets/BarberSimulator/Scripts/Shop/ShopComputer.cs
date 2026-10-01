using System;
using BarberSimulator.Interaction;
using UnityEngine;

namespace BarberSimulator.Shop
{
    /// <summary>The laptop on the reception counter. Using it opens the upgrade store.</summary>
    public sealed class ShopComputer : Interactable
    {
        [SerializeField] private string labelKey = "interact.shop_computer";

        /// <summary>Raised when the player sits down at the computer; the flow controller opens the store.</summary>
        public event Action Used;

        public override bool CanInteract(InteractionContext context) => true;

        public override InteractionPrompt GetPrompt(InteractionContext context) =>
            new InteractionPrompt(InteractionVerb.Use, labelKey);

        public override void Interact(InteractionContext context)
        {
            Used?.Invoke();
        }
    }
}
