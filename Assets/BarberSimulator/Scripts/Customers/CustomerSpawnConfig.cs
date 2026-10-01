using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>How often customers come. Progression (reputation, upgrades) scales these values at runtime.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Customers/Spawn Config", fileName = "CustomerSpawnConfig")]
    public sealed class CustomerSpawnConfig : ScriptableObject
    {
        public GameObject customerPrefab;
        [Tooltip("Delay before the very first (tutorial) customer walks in after the shop opens.")]
        public float firstCustomerDelay = 6f;
        public float minInterval = 40f;
        public float maxInterval = 80f;
        [Min(1)] public int maxActiveCustomers = 3;
        public CustomerProfile tutorialProfile;
        public CustomerProfile[] profiles = { };
        [Tooltip("Reputation (0-100) at which intervals are shortened by 'busyFactor'.")]
        public float busyReputation = 60f;
        [Range(0.3f, 1f)] public float busyFactor = 0.7f;
    }
}
