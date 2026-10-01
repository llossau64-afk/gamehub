namespace BarberSimulator.NPC
{
    /// <summary>Lifecycle of a customer visit. Implemented by <see cref="CustomerBrain"/>.</summary>
    public enum CustomerState
    {
        Entering,
        Waiting,
        Talking,
        WalkingToChair,
        Sitting,
        Haircut,
        Paying,
        Leaving,
        Gone
    }
}
