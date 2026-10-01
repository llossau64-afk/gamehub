using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>
    /// Brings customers in at a relaxed, configurable pace while the shop is open. Customers are pooled.
    /// The first customer after opening is the forgiving tutorial customer.
    /// </summary>
    public sealed class CustomerSpawner : MonoBehaviour
    {
        [SerializeField] private CustomerSpawnConfig config;
        [SerializeField] private ShopCustomerSite site;
        [SerializeField] private Transform poolRoot;

        private readonly List<CustomerBrain> _pool = new List<CustomerBrain>();
        private readonly List<CustomerBrain> _active = new List<CustomerBrain>();
        private CustomerServices _services;
        private float _timer;
        private bool _open;
        private int _seed;
        private bool _tutorialPending;

        public bool IsOpen => _open;
        public IReadOnlyList<CustomerBrain> Active => _active;
        public CustomerSpawnConfig Config => config;

        public void Configure(CustomerSpawnConfig spawnConfig, ShopCustomerSite customerSite, Transform pool)
        {
            config = spawnConfig;
            site = customerSite;
            poolRoot = pool;
        }

        public void Initialize(CustomerServices services)
        {
            _services = services;
            _seed = System.Environment.TickCount;
        }

        public void SetOpen(bool open, bool tutorialFirst)
        {
            if (open && !_open)
            {
                _tutorialPending = tutorialFirst && config.tutorialProfile != null;
                _timer = tutorialFirst ? config.firstCustomerDelay : Random.Range(8f, 16f);
            }
            _open = open;
        }

        private void Update()
        {
            if (!_open || config == null || _services == null) return;
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;

            // During the tutorial customer nobody else walks in.
            bool tutorialActive = false;
            foreach (var c in _active) if (c.IsTutorial) tutorialActive = true;

            if (!tutorialActive && _active.Count < config.maxActiveCustomers && site.HasRoomForNewCustomer())
            {
                Spawn(_tutorialPending ? config.tutorialProfile : PickProfile());
                _tutorialPending = false;
            }
            _timer = NextInterval();
        }

        private float NextInterval()
        {
            float interval = Random.Range(config.minInterval, config.maxInterval);
            float reputation = _services.Economy != null ? _services.Economy.Reputation : 0f;
            if (reputation >= config.busyReputation) interval *= config.busyFactor;
            return interval;
        }

        private CustomerProfile PickProfile()
        {
            float total = 0f;
            foreach (var p in config.profiles) if (p != null) total += p.spawnWeight;
            float pick = Random.value * total;
            foreach (var p in config.profiles)
            {
                if (p == null) continue;
                pick -= p.spawnWeight;
                if (pick <= 0f) return p;
            }
            return config.profiles.Length > 0 ? config.profiles[0] : config.tutorialProfile;
        }

        /// <summary>Spawns a customer right now (also used by the debug tools).</summary>
        public CustomerBrain Spawn(CustomerProfile profile)
        {
            if (profile == null || config.customerPrefab == null) return null;
            CustomerBrain customer = null;
            foreach (var pooled in _pool)
                if (!pooled.gameObject.activeSelf) { customer = pooled; break; }

            if (customer == null)
            {
                var go = Instantiate(config.customerPrefab, poolRoot);
                customer = go.GetComponent<CustomerBrain>();
                customer.Despawned += OnDespawned;
                _pool.Add(customer);
            }

            _active.Add(customer);
            customer.BeginVisit(site, _services, profile, ++_seed);
            return customer;
        }

        private void OnDespawned(CustomerBrain customer)
        {
            _active.Remove(customer);
        }
    }
}
