using System;
using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Haircut
{
    /// <summary>Target length for one zone/band of a requested haircut.</summary>
    [Serializable]
    public sealed class ZoneTarget
    {
        public HairZone zone;
        public HairBand band = HairBand.Any;
        [Tooltip("Target length in cm.")]
        public float length;
        [Tooltip("Allowed deviation in cm before the score drops.")]
        public float tolerance = 0.3f;
        [Tooltip("Relative importance when scoring.")]
        public float weight = 1f;
        [Tooltip("Checklist group shown to the player (e.g. 'Sides', 'Top').")]
        public string checklistKey;
    }

    /// <summary>
    /// A hairstyle a customer can ask for. Data-driven: add new styles as assets without touching code.
    /// </summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Haircut/Haircut Request", fileName = "HaircutRequest")]
    public sealed class HaircutRequest : ScriptableObject
    {
        [SerializeField] private string requestId;
        [SerializeField] private string nameKey;
        [Tooltip("What the customer says; one is picked at random.")]
        [SerializeField] private string[] askLineKeys = Array.Empty<string>();
        [SerializeField] private int basePrice = 20;
        [Tooltip("Shop level at which customers start asking for this style.")]
        [SerializeField, Min(1)] private int requiredShopLevel = 1;
        [SerializeField] private bool requiresFade;
        [Tooltip("Steps players should follow; shown as hints for tutorial customers.")]
        [SerializeField] private string[] tutorialHintKeys = Array.Empty<string>();
        [SerializeField] private List<ZoneTarget> targets = new List<ZoneTarget>();

        public string RequestId => requestId;
        public string NameKey => nameKey;
        public IReadOnlyList<string> AskLineKeys => askLineKeys;
        public int BasePrice => basePrice;
        public int RequiredShopLevel => requiredShopLevel;
        public bool RequiresFade => requiresFade;
        public IReadOnlyList<string> TutorialHintKeys => tutorialHintKeys;
        public IReadOnlyList<ZoneTarget> Targets => targets;

        public void Configure(string id, string displayNameKey, string[] askLines, int price, bool fade, string[] tutorialHints, List<ZoneTarget> zoneTargets)
        {
            requestId = id;
            nameKey = displayNameKey;
            askLineKeys = askLines;
            basePrice = price;
            requiresFade = fade;
            tutorialHintKeys = tutorialHints;
            targets = zoneTargets;
        }

        public void SetRequiredShopLevel(int level)
        {
            requiredShopLevel = Mathf.Max(1, level);
        }

        /// <summary>Distinct checklist entries in display order.</summary>
        public List<string> ChecklistKeys()
        {
            var keys = new List<string>();
            foreach (var t in targets)
                if (!string.IsNullOrEmpty(t.checklistKey) && !keys.Contains(t.checklistKey)) keys.Add(t.checklistKey);
            if (requiresFade && !keys.Contains("check.fade")) keys.Insert(Mathf.Min(1, keys.Count), "check.fade");
            return keys;
        }
    }
}
