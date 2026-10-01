using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>Verb shown on the prompt / touch button. Extend as new gameplay arrives.</summary>
    public enum InteractionVerb
    {
        Use,
        Open,
        Close,
        Talk,
        Cut,
        Buy,
        Clean,
        Sit,
        PickUp,
        Inspect,
        Locked
    }

    public readonly struct InteractionPrompt
    {
        public readonly InteractionVerb Verb;
        /// <summary>Localization key for the object label, e.g. "interact.trash".</summary>
        public readonly string LabelKey;

        public InteractionPrompt(InteractionVerb verb, string labelKey)
        {
            Verb = verb;
            LabelKey = labelKey;
        }
    }

    /// <summary>Context handed to interactables so they never need to search for the player.</summary>
    public sealed class InteractionContext
    {
        public Transform Player;
        public Camera Camera;
        public Player.FirstPersonController Controller;
        public Player.FirstPersonHands Hands;
    }

    /// <summary>Anything the player can use. Desktop (E) and touch (USE button) both call <see cref="Interact"/>.</summary>
    public interface IInteractable
    {
        bool CanInteract(InteractionContext context);
        InteractionPrompt GetPrompt(InteractionContext context);
        void Interact(InteractionContext context);
    }

    /// <summary>Optional hover feedback.</summary>
    public interface IFocusable
    {
        void OnFocusGained();
        void OnFocusLost();
    }
}
