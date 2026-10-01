using UnityEngine;

namespace BarberSimulator.NPC
{
    /// <summary>
    /// What a customer needs from the shop. The customer phase implements this on the shop (seat reservation,
    /// queueing, multiple chairs); keeping it an interface lets employees and multi-chair layouts reuse the brain.
    /// </summary>
    public interface ICustomerSite
    {
        Transform Entrance { get; }
        Transform Exit { get; }
        Transform Register { get; }
        bool TryReserveWaitingSeat(CustomerBrain customer, out Transform seat);
        void ReleaseWaitingSeat(CustomerBrain customer);
        bool TryReserveBarberChair(CustomerBrain customer, out Transform seat);
        void ReleaseBarberChair(CustomerBrain customer);
    }
}
