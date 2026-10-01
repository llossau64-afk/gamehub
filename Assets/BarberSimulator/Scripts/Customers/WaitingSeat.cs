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
        public bool IsFree => Occupant == null;

        public void Configure(Transform seat, Transform approach)
        {
            seatPoint = seat;
            approachPoint = approach;
        }

        public bool TryReserve(CustomerBrain customer)
        {
            if (Occupant != null) return false;
            Occupant = customer;
            return true;
        }

        public void Release(CustomerBrain customer)
        {
            if (Occupant == customer) Occupant = null;
        }
    }
}
