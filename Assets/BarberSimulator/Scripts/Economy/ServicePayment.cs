using UnityEngine;

namespace BarberSimulator.Economy
{
    /// <summary>What a customer pays for a service and what it does to the shop's reputation.</summary>
    public struct ServicePayment
    {
        public string ServiceNameKey;
        public int BasePrice;
        public int Tip;
        public int Total => BasePrice + Tip;
        public int Stars;
        public float ReputationDelta;
    }

    /// <summary>Central pricing rules so UI, customers and future employees all pay the same way.</summary>
    public static class PaymentCalculator
    {
        /// <param name="quality">Haircut score 0..1.</param>
        /// <param name="patience01">Remaining patience 0..1.</param>
        /// <param name="tipMultiplier">Upgrade bonus on the size of tips.</param>
        /// <param name="reputationGainMultiplier">Upgrade bonus on positive reputation changes.</param>
        public static ServicePayment Calculate(string serviceNameKey, int basePrice, int stars, float quality, float budget,
            float tipChance, float patience01, float reputation, System.Random rng, float tipMultiplier = 1f, float reputationGainMultiplier = 1f)
        {
            // Customers always pay the listed price; how happy they are shows in tips and reputation.
            int price = Mathf.Max(1, Mathf.RoundToInt(basePrice * Mathf.Clamp(budget, 0.8f, 1.5f)));
            int tip = 0;
            float chance = tipChance * Mathf.Lerp(0.2f, 1.2f, quality) * Mathf.Lerp(0.5f, 1f, patience01);
            if (stars >= 4 && rng.NextDouble() < chance)
            {
                float percent = stars == 5 ? Mathf.Lerp(0.15f, 0.3f, (float)rng.NextDouble()) : Mathf.Lerp(0.08f, 0.15f, (float)rng.NextDouble());
                percent *= Mathf.Lerp(0.9f, 1.25f, reputation / 100f) * Mathf.Max(0f, tipMultiplier);
                tip = Mathf.Max(1, Mathf.RoundToInt(price * percent));
            }

            float reputationDelta;
            switch (stars)
            {
                case 5: reputationDelta = 4f; break;
                case 4: reputationDelta = 2.5f; break;
                case 3: reputationDelta = 0.5f; break;
                case 2: reputationDelta = -2f; break;
                default: reputationDelta = -4f; break;
            }
            if (reputationDelta > 0f) reputationDelta *= Mathf.Max(0f, reputationGainMultiplier);

            return new ServicePayment
            {
                ServiceNameKey = serviceNameKey,
                BasePrice = price,
                Tip = tip,
                Stars = stars,
                ReputationDelta = reputationDelta
            };
        }
    }
}
