using UnityEngine;

namespace BarberSimulator.Shop
{
    /// <summary>
    /// A scene object that belongs to an upgrade. The generator builds it disabled; <see cref="ShopState"/> enables
    /// it once the upgrade is owned (on load and on purchase).
    /// </summary>
    public sealed class UpgradeProp : MonoBehaviour
    {
        [SerializeField] private string upgradeId;

        public string UpgradeId => upgradeId;

        public void Configure(string id)
        {
            upgradeId = id;
        }

        public void SetOwned(bool owned)
        {
            if (gameObject.activeSelf != owned) gameObject.SetActive(owned);
        }
    }
}
