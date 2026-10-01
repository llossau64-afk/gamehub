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

        /// <summary>Picks a hairstyle the shop is experienced enough to offer (<see cref="HaircutRequest.RequiredShopLevel"/>).</summary>
        public HaircutRequest PickRequest(System.Random rng, int shopLevel = 1)
        {
            if (preferredRequest != null && preferredRequest.RequiredShopLevel <= shopLevel
                && (possibleRequests.Length == 0 || rng.NextDouble() < 0.5)) return preferredRequest;

            int eligible = 0;
            foreach (var request in possibleRequests)
                if (request != null && request.RequiredShopLevel <= shopLevel) eligible++;
            if (eligible > 0)
            {
                int pick = rng.Next(eligible);
                foreach (var request in possibleRequests)
                {
                    if (request == null || request.RequiredShopLevel > shopLevel) continue;
                    if (pick-- == 0) return request;
                }
            }

            // Nothing unlocked yet: fall back to the easiest style this profile knows.
            HaircutRequest easiest = preferredRequest;
            foreach (var request in possibleRequests)
                if (request != null && (easiest == null || request.RequiredShopLevel < easiest.RequiredShopLevel)) easiest = request;
            return easiest;
        }

        public string PickName(System.Random rng) => firstNames.Length > 0 ? firstNames[rng.Next(firstNames.Length)] : "Customer";
    }
}
