using BarberSimulator.Interaction;
using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>Lets the player talk to a customer waiting at the counter.</summary>
    [RequireComponent(typeof(CustomerBrain))]
    public sealed class CustomerInteractable : Interactable
    {
        private CustomerBrain _brain;

        protected override bool UsesHighlight => false;

        protected override void Awake()
        {
            base.Awake();
            _brain = GetComponent<CustomerBrain>();
        }

        public override bool CanInteract(InteractionContext context) => _brain != null && _brain.IsAwaitingConversation;

        public override InteractionPrompt GetPrompt(InteractionContext context) =>
            new InteractionPrompt(InteractionVerb.Talk, "interact.customer");

        public override void Interact(InteractionContext context)
        {
            if (!CanInteract(context)) return;
            _brain.StartConversation();
        }
    }
}
