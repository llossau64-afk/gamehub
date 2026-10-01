using System;
using System.Collections.Generic;
using BarberSimulator.Economy;
using BarberSimulator.Haircut;
using BarberSimulator.Save;

namespace BarberSimulator.Shop
{
    public enum PurchaseStatus
    {
        Available,
        Owned,
        LevelTooLow,
        NotEnoughMoney
    }

    /// <summary>
    /// Buying and owning upgrades. Ownership is stored in <c>shop.ownedItemIds</c>; this service turns it into
    /// aggregated <see cref="UpgradeEffects"/>, scene props, unlocked areas and the barber's toolbox.
    /// </summary>
    public sealed class UpgradeService
    {
        private readonly UpgradeCatalog _catalog;
        private readonly SaveService _save;
        private readonly EconomyService _economy;
        private readonly ShopProgression _progression;
        private readonly UpgradeEffects _effects;
        private ShopState _shop;

        public IReadOnlyList<UpgradeDefinition> All => _catalog != null ? _catalog.Upgrades : System.Array.Empty<UpgradeDefinition>();

        public event Action<UpgradeDefinition> Purchased;

        public UpgradeService(UpgradeCatalog catalog, SaveService save, EconomyService economy, ShopProgression progression, UpgradeEffects effects)
        {
            _catalog = catalog;
            _save = save;
            _economy = economy;
            _progression = progression;
            _effects = effects;
        }

        public void BindScene(ShopState shop)
        {
            _shop = shop;
        }

        public bool IsOwned(UpgradeDefinition upgrade) => upgrade != null && _save.Data.shop.ownedItemIds.Contains(upgrade.upgradeId);

        public PurchaseStatus GetStatus(UpgradeDefinition upgrade)
        {
            if (IsOwned(upgrade)) return PurchaseStatus.Owned;
            if (_progression.Level < upgrade.requiredShopLevel) return PurchaseStatus.LevelTooLow;
            if (_economy.Money < upgrade.price) return PurchaseStatus.NotEnoughMoney;
            return PurchaseStatus.Available;
        }

        public bool TryPurchase(UpgradeDefinition upgrade)
        {
            if (upgrade == null || GetStatus(upgrade) != PurchaseStatus.Available) return false;
            if (!_economy.TrySpend(upgrade.price)) return false;

            _save.Data.shop.ownedItemIds.Add(upgrade.upgradeId);
            Refresh();
            _save.RequestSave();
            Purchased?.Invoke(upgrade);
            return true;
        }

        /// <summary>Re-applies everything the owned upgrades imply. Safe to call at any time (load, new game, purchase).</summary>
        public void Refresh()
        {
            var shop = _save.Data.shop;
            var owned = new List<UpgradeDefinition>();
            foreach (var upgrade in All)
            {
                if (upgrade == null || !shop.ownedItemIds.Contains(upgrade.upgradeId)) continue;
                owned.Add(upgrade);
                if (!string.IsNullOrEmpty(upgrade.unlockToolId) && !_save.Data.player.ownedToolIds.Contains(upgrade.unlockToolId))
                    _save.Data.player.ownedToolIds.Add(upgrade.unlockToolId);
                if (!string.IsNullOrEmpty(upgrade.unlockAreaId) && !shop.unlockedAreaIds.Contains(upgrade.unlockAreaId))
                    shop.unlockedAreaIds.Add(upgrade.unlockAreaId);
            }
            _effects.Rebuild(owned);
            if (_shop != null) _shop.ApplyUpgrades(shop.ownedItemIds, shop.unlockedAreaIds);
        }

        // ---------------------------------------------------------------- toolbox

        /// <summary>
        /// The tools offered in barber mode, in slot order: every default tool, replaced by its owned upgrade
        /// (so hotkeys stay put), followed by owned tools that replace nothing.
        /// </summary>
        public BarberToolDefinition[] BuildToolbox(IReadOnlyList<BarberToolDefinition> allTools)
        {
            var result = new List<BarberToolDefinition>();
            foreach (var tool in allTools)
            {
                if (tool == null || !tool.ownedByDefault) continue;
                result.Add(ResolveReplacement(tool, allTools));
            }
            foreach (var tool in allTools)
            {
                if (tool == null || tool.ownedByDefault || result.Contains(tool)) continue;
                if (_save.Data.player.ownedToolIds.Contains(tool.toolId)) result.Add(tool);
            }
            return result.ToArray();
        }

        private BarberToolDefinition ResolveReplacement(BarberToolDefinition tool, IReadOnlyList<BarberToolDefinition> allTools)
        {
            var best = tool;
            foreach (var upgrade in All)
            {
                if (upgrade == null || upgrade.replacesToolId != tool.toolId || string.IsNullOrEmpty(upgrade.unlockToolId)) continue;
                if (!IsOwned(upgrade)) continue;
                foreach (var candidate in allTools)
                    if (candidate != null && candidate.toolId == upgrade.unlockToolId) best = candidate;
            }
            return best;
        }
    }
}
