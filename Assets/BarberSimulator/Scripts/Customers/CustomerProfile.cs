using BarberSimulator.Haircut;
using UnityEngine;

namespace BarberSimulator.Customers
{
    public enum CustomerPersonality
    {
        Relaxed,
        Friendly,
        Quiet,
        Impatient,
        Picky
    }

    /// <summary>A type of customer. Spawned customers pick a name and a request from here.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Customers/Customer Profile", fileName = "CustomerProfile")]
    public sealed class CustomerProfile : ScriptableObject
    {
        public string profileId;
        public CustomerPersonality personality = CustomerPersonality.Relaxed;
        public string[] firstNames = { "Sam" };
        [Tooltip("Seconds of waiting before patience runs out. 0 = infinite (tutorial).")]
        public float patienceSeconds = 180f;
        [Tooltip("Multiplier on the service price this customer is willing to pay.")]
        public float budget = 1f;
        [Range(0f, 1f)] public float tipChance = 0.5f;
        [Tooltip(">1 = more forgiving evaluation, <1 = stricter.")]
        public float leniency = 1f;
        [Range(0.5f, 1.5f)] public float reviewStrictness = 1f;
        public HaircutRequest[] possibleRequests = { };
        [Tooltip("Optional favourite; picked 50% of the time when set.")]
        public HaircutRequest preferredRequest;
        public CustomerDialogueSet dialogue;
        public bool isTutorial;
        [Range(0f, 1f)] public float spawnWeight = 1f;

        public HaircutRequest PickRequest(System.Random rng)
        {
            if (preferredRequest != null && (possibleRequests.Length == 0 || rng.NextDouble() < 0.5)) return preferredRequest;
            return possibleRequests.Length > 0 ? possibleRequests[rng.Next(possibleRequests.Length)] : preferredRequest;
        }

        public string PickName(System.Random rng) => firstNames.Length > 0 ? firstNames[rng.Next(firstNames.Length)] : "Customer";
    }
}
