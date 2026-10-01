using System;
using BarberSimulator.Interaction;
using UnityEngine;

namespace BarberSimulator.Customers
{
    public enum ChairState
    {
        Available,
        Reserved,
        Occupied,
        HaircutInProgress
    }

    /// <summary>
    /// A barber chair that can be claimed by exactly one customer. The player (or, later, an employee) serves the
    /// seated customer. Any number of stations can exist; the customer site routes customers to free ones.
    /// </summary>
    public sealed class BarberChairStation : Interactable
    {
        [SerializeField] private string stationId = "chair_1";
        [SerializeField] private Transform seatPoint;
        [SerializeField] private Transform approachPoint;
        [SerializeField] private Transform mirrorLookPoint;
        [SerializeField] private GameObject cape;
        [SerializeField] private Renderer hairDebris;
        [SerializeField] private GameObject[] hideDuringHaircut = Array.Empty<GameObject>();

        private CustomerBrain _occupant;
        private float _debrisAmount;
        private MaterialPropertyBlock _debrisBlock;

        public string StationId => stationId;
        public ChairState State { get; private set; } = ChairState.Available;
        public CustomerBrain Occupant => _occupant;
        public Transform SeatPoint => seatPoint;
        public Transform ApproachPoint => approachPoint;
        public Transform MirrorLookPoint => mirrorLookPoint;
        /// <summary>Who serves this chair. Null = the player. Employees will set themselves here.</summary>
        public object AssignedBarber { get; set; }

        /// <summary>Raised when the player asks to start cutting the seated customer.</summary>
        public event Action<BarberChairStation> HaircutRequested;

        public void Configure(string id, Transform seat, Transform approach, Transform mirrorLook, GameObject capeObject, Renderer debris, GameObject[] hidden)
        {
            stationId = id;
            seatPoint = seat;
            approachPoint = approach;
            mirrorLookPoint = mirrorLook;
            cape = capeObject;
            hairDebris = debris;
            hideDuringHaircut = hidden;
        }

        protected override void Awake()
        {
            base.Awake();
            if (cape != null) cape.SetActive(false);
            SetDebris(0f);
        }

        public bool TryReserve(CustomerBrain customer)
        {
            if (State != ChairState.Available || customer == null) return false;
            _occupant = customer;
            State = ChairState.Reserved;
            return true;
        }

        public void MarkSeated(CustomerBrain customer)
        {
            if (_occupant != customer) return;
            State = ChairState.Occupied;
            if (cape != null) cape.SetActive(true);
        }

        public void BeginHaircut()
        {
            if (State != ChairState.Occupied) return;
            State = ChairState.HaircutInProgress;
            foreach (var go in hideDuringHaircut) if (go != null) go.SetActive(false);
        }

        public void EndHaircut(float hairRemoved)
        {
            foreach (var go in hideDuringHaircut) if (go != null) go.SetActive(true);
            if (State == ChairState.HaircutInProgress) State = ChairState.Occupied;
            SetDebris(_debrisAmount + Mathf.Clamp01(hairRemoved / 150f) * 0.8f + 0.15f);
        }

        public void Release(CustomerBrain customer)
        {
            if (_occupant != customer) return;
            _occupant = null;
            State = ChairState.Available;
            if (cape != null) cape.SetActive(false);
        }

        /// <summary>Hair on the floor; cleaning gameplay will reduce this later.</summary>
        public void SetDebris(float amount)
        {
            _debrisAmount = Mathf.Clamp01(amount);
            if (hairDebris == null) return;
            hairDebris.gameObject.SetActive(_debrisAmount > 0.01f);
            if (_debrisBlock == null) _debrisBlock = new MaterialPropertyBlock();
            _debrisBlock.SetColor("_BaseColor", new Color(1f, 1f, 1f, _debrisAmount));
            hairDebris.SetPropertyBlock(_debrisBlock);
        }

        public override bool CanInteract(InteractionContext context) =>
            State == ChairState.Occupied && _occupant != null && _occupant.IsReadyForHaircut;

        public override InteractionPrompt GetPrompt(InteractionContext context) =>
            new InteractionPrompt(InteractionVerb.Cut, "interact.barber_chair");

        public override void Interact(InteractionContext context)
        {
            if (!CanInteract(context)) return;
            HaircutRequested?.Invoke(this);
        }
    }
}
