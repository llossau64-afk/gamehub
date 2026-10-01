using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>A chair in the waiting area that one customer can reserve.</summary>
    public sealed class WaitingSeat : MonoBehaviour
    {
        [SerializeField] private Transform seatPoint;
        [SerializeField] private Transform approachPoint;

        public Transform SeatPoint => seatPoint;
        public Transform ApproachPoint => approachPoint;
        public CustomerBrain Occupant { get; private set; }
        /// <summary>Seats that belong to an upgrade (second bench) are inactive until it is bought.</summary>
        public bool IsFree => Occupant == null && isActiveAndEnabled;

        public void Configure(Transform seat, Transform approach)
        {
            seatPoint = seat;
            approachPoint = approach;
        }

        public bool TryReserve(CustomerBrain customer)
        {
            if (Occupant != null || !isActiveAndEnabled) return false;
            Occupant = customer;
            return true;
        }

        public void Release(CustomerBrain customer)
        {
            if (Occupant == customer) Occupant = null;
        }
    }
}
