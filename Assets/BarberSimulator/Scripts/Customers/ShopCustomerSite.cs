using System;
using System.Collections.Generic;
using BarberSimulator.Interaction;
using BarberSimulator.Navigation;
using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>
    /// The shop as seen by customers: routes (nav graph), the reception spot, the register, waiting seats and
    /// barber chairs, plus the queue rules. All reservations go through here so two customers can never claim the
    /// same seat or chair. Works with any number of chairs/seats (future expansions register more).
    /// </summary>
    public sealed class ShopCustomerSite : MonoBehaviour
    {
        [SerializeField] private NavGraph navigation;
        [SerializeField] private Transform[] streetSpawns = Array.Empty<Transform>();
        [SerializeField] private Transform doorOutside;
        [SerializeField] private Transform entranceInside;
        [SerializeField] private Transform receptionStand;
        [SerializeField] private Transform registerStand;
        [SerializeField] private SwingDoor frontDoor;
        [SerializeField] private List<BarberChairStation> chairs = new List<BarberChairStation>();
        [SerializeField] private List<WaitingSeat> waitingSeats = new List<WaitingSeat>();

        private readonly List<CustomerBrain> _queue = new List<CustomerBrain>();
        private CustomerBrain _receptionOwner;

        public NavGraph Navigation => navigation;
        public Transform DoorOutside => doorOutside;
        public Transform EntranceInside => entranceInside;
        public Transform ReceptionStand => receptionStand;
        public Transform RegisterStand => registerStand;
        public SwingDoor FrontDoor => frontDoor;
        public IReadOnlyList<BarberChairStation> Chairs => chairs;
        public int Capacity => waitingSeats.Count + chairs.Count + 1;
        public int ActiveCustomers => _queue.Count;

        public void Configure(NavGraph graph, Transform[] spawns, Transform outside, Transform inside, Transform reception, Transform register,
            SwingDoor door, List<BarberChairStation> stations, List<WaitingSeat> seats)
        {
            navigation = graph;
            streetSpawns = spawns;
            doorOutside = outside;
            entranceInside = inside;
            receptionStand = reception;
            registerStand = register;
            frontDoor = door;
            chairs = stations;
            waitingSeats = seats;
        }

        public void RegisterChair(BarberChairStation chair) { if (!chairs.Contains(chair)) chairs.Add(chair); }
        public void RegisterWaitingSeat(WaitingSeat seat) { if (!waitingSeats.Contains(seat)) waitingSeats.Add(seat); }

        public Transform RandomStreetSpawn(System.Random rng) => streetSpawns.Length > 0 ? streetSpawns[rng.Next(streetSpawns.Length)] : doorOutside;

        /// <summary>True when one more customer can be accommodated (a seat, the reception or a chair).</summary>
        public bool HasRoomForNewCustomer()
        {
            int waitingCapacity = 0;
            foreach (var seat in waitingSeats) if (seat.IsFree) waitingCapacity++;
            bool chairFree = false;
            foreach (var chair in chairs) if (chair.State == ChairState.Available) chairFree = true;
            return _queue.Count < Capacity && (waitingCapacity > 0 || _receptionOwner == null || chairFree);
        }

        public void Join(CustomerBrain customer)
        {
            if (!_queue.Contains(customer)) _queue.Add(customer);
        }

        public void Leave(CustomerBrain customer)
        {
            _queue.Remove(customer);
            ReleaseReception(customer);
            foreach (var seat in waitingSeats) seat.Release(customer);
            foreach (var chair in chairs) chair.Release(customer);
        }

        /// <summary>The longest-waiting customer who has not ordered yet gets the reception spot.</summary>
        public bool TryClaimReception(CustomerBrain customer)
        {
            if (_receptionOwner == customer) return true;
            if (_receptionOwner != null) return false;
            foreach (var queued in _queue)
            {
                if (queued.HasOrdered) continue;
                if (queued != customer) return false; // someone arrived earlier
                break;
            }
            _receptionOwner = customer;
            return true;
        }

        public void ReleaseReception(CustomerBrain customer)
        {
            if (_receptionOwner == customer) _receptionOwner = null;
        }

        public bool IsReceptionOwner(CustomerBrain customer) => _receptionOwner == customer;

        public WaitingSeat ReserveWaitingSeat(CustomerBrain customer)
        {
            foreach (var seat in waitingSeats)
                if (seat.Occupant == customer) return seat;
            foreach (var seat in waitingSeats)
                if (seat.TryReserve(customer)) return seat;
            return null;
        }

        public void ReleaseWaitingSeat(CustomerBrain customer)
        {
            foreach (var seat in waitingSeats) seat.Release(customer);
        }

        /// <summary>Chairs go to customers who ordered, in arrival order.</summary>
        public BarberChairStation TryReserveChair(CustomerBrain customer)
        {
            foreach (var queued in _queue)
            {
                if (!queued.HasOrdered || queued.HasChair) continue;
                if (queued != customer) return null;
                break;
            }
            foreach (var chair in chairs)
                if (chair.AssignedBarber == null && chair.TryReserve(customer)) return chair;
            return null;
        }

        public List<Vector3> PathTo(Vector3 from, Transform goal) => navigation.FindPath(from, goal);

        private float _doorCloseTimer;
        private bool _openedByCustomers;

        /// <summary>Customers open the front door when they reach it and it swings shut behind them.</summary>
        private void Update()
        {
            if (frontDoor == null || _queue.Count == 0 && !_openedByCustomers) return;
            var doorPosition = (doorOutside.position + entranceInside.position) * 0.5f;
            bool someoneNear = false;
            foreach (var customer in _queue)
            {
                if (customer == null || !customer.isActiveAndEnabled) continue;
                var offset = customer.transform.position - doorPosition;
                offset.y = 0f;
                if (offset.sqrMagnitude < 1.6f * 1.6f) { someoneNear = true; break; }
            }

            if (someoneNear)
            {
                _doorCloseTimer = 1.6f;
                if (!frontDoor.IsOpen)
                {
                    frontDoor.SetOpen(true, playSound: true);
                    _openedByCustomers = true;
                }
                return;
            }

            if (!_openedByCustomers) return;
            _doorCloseTimer -= Time.deltaTime;
            if (_doorCloseTimer > 0f) return;
            _openedByCustomers = false;
            if (frontDoor.IsOpen) frontDoor.SetOpen(false, playSound: true);
        }
    }
}
