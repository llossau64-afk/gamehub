namespace BarberSimulator.Customers
{
    /// <summary>Lifecycle of one customer visit.</summary>
    public enum CustomerState
    {
        Spawn,
        WalkToShop,
        Enter,
        CheckAvailability,
        Wait,
        ApproachReception,
        Dialogue,
        WalkToChair,
        SitDown,
        WaitForPlayer,
        Haircut,
        Result,
        StandUp,
        Pay,
        Leave,
        Despawn
    }
}
