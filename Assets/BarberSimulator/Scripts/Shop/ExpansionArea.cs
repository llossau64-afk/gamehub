using BarberSimulator.Interaction;
using UnityEngine;

namespace BarberSimulator.Shop
{
    /// <summary>
    /// A part of the building that can be bought/renovated later (second chair room, wash stations...).
    /// Phase 1 only shows the locked state; the expansion phase will add cost, renovation and unlocked visuals.
    /// </summary>
    public sealed class ExpansionArea : MonoBehaviour
    {
        [SerializeField] private string areaId;
        [SerializeField] private string nameKey;
        [SerializeField] private int unlockCost;
        [SerializeField] private LockedDoor entrance;
        [SerializeField] private GameObject lockedVisuals;
        [SerializeField] private GameObject unlockedVisuals;

        public string AreaId => areaId;
        public string NameKey => nameKey;
        public int UnlockCost => unlockCost;
        public bool IsUnlocked { get; private set; }

        public void Configure(string id, string displayNameKey, int cost, LockedDoor door, GameObject locked, GameObject unlocked)
        {
            areaId = id;
            nameKey = displayNameKey;
            unlockCost = cost;
            entrance = door;
            lockedVisuals = locked;
            unlockedVisuals = unlocked;
        }

        public void ApplyState(bool unlocked)
        {
            IsUnlocked = unlocked;
            if (entrance != null) entrance.Unlocked = unlocked;
            if (lockedVisuals != null) lockedVisuals.SetActive(!unlocked);
            if (unlockedVisuals != null) unlockedVisuals.SetActive(unlocked);
        }
    }
}
