using System.Collections.Generic;
using BarberSimulator.Interaction;
using BarberSimulator.Objectives;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Shop
{
    /// <summary>
    /// Scene-side view of the shop: knows its trash, inspection points, interactables and expansions,
    /// restores them from the save and reports progress to the objective system.
    /// </summary>
    public sealed class ShopState : MonoBehaviour
    {
        [SerializeField] private List<TrashPickup> trash = new List<TrashPickup>();
        [SerializeField] private List<InspectionPoint> inspectionPoints = new List<InspectionPoint>();
        [SerializeField] private List<ExpansionArea> expansions = new List<ExpansionArea>();
        [SerializeField] private SwingDoor frontDoor;
        [SerializeField] private Transform gameplaySpawn;
        [SerializeField] private List<UpgradeProp> upgradeProps = new List<UpgradeProp>();

        private SaveService _save;
        private ObjectiveService _objectives;

        public SwingDoor FrontDoor => frontDoor;
        public Transform GameplaySpawn => gameplaySpawn;
        public int TrashTotal => trash.Count;

        public void Configure(List<TrashPickup> trashItems, List<InspectionPoint> points, List<ExpansionArea> areas, SwingDoor door, Transform spawn)
        {
            trash = trashItems;
            inspectionPoints = points;
            expansions = areas;
            frontDoor = door;
            gameplaySpawn = spawn;
        }

        public void SetUpgradeProps(List<UpgradeProp> props)
        {
            upgradeProps = props;
        }

        public void Initialize(SaveService save, ObjectiveService objectives, InteractionServices services, Transform player)
        {
            _save = save;
            _objectives = objectives;

            foreach (var interactable in GetComponentsInChildren<Interactable>(true))
                interactable.Bind(services);

            var shopData = save.Data.shop;
            foreach (var item in trash)
            {
                if (item == null) continue;
                if (shopData.collectedTrashIds.Contains(item.TrashId)) item.MarkCollectedSilently();
                else item.Collected += OnTrashCollected;
            }

            var visited = save.Data.progression.visitedInspectionPointIds;
            foreach (var point in inspectionPoints)
            {
                if (point == null) continue;
                point.Bind(player, visited.Contains(point.PointId));
                point.Visited += OnPointVisited;
            }

            ApplyUpgrades(shopData.ownedItemIds, shopData.unlockedAreaIds);

            _objectives.Started += OnObjectiveStarted;
        }

        /// <summary>Shows the props of owned upgrades, hides the rest, and opens the unlocked expansion areas.</summary>
        public void ApplyUpgrades(ICollection<string> ownedUpgradeIds, ICollection<string> unlockedAreaIds)
        {
            foreach (var prop in upgradeProps)
                if (prop != null) prop.SetOwned(ownedUpgradeIds.Contains(prop.UpgradeId));
            foreach (var area in expansions)
                if (area != null) area.ApplyState(unlockedAreaIds.Contains(area.AreaId));
        }

        private void OnDestroy()
        {
            if (_objectives != null) _objectives.Started -= OnObjectiveStarted;
        }

        /// <summary>Catches up progress done before the matching objective became active.</summary>
        private void OnObjectiveStarted(ObjectiveDefinition objective)
        {
            if (objective.Signal == ObjectiveSignals.TrashCollected)
                _objectives.SetProgress(ObjectiveSignals.TrashCollected, _save.Data.shop.collectedTrashIds.Count);
            else if (objective.Signal == ObjectiveSignals.InspectionPointVisited)
                _objectives.SetProgress(ObjectiveSignals.InspectionPointVisited, _save.Data.progression.visitedInspectionPointIds.Count);
        }

        public void ResyncObjectiveProgress()
        {
            if (_objectives.Current != null) OnObjectiveStarted(_objectives.Current);
        }

        private void OnTrashCollected(TrashPickup item)
        {
            var ids = _save.Data.shop.collectedTrashIds;
            if (!ids.Contains(item.TrashId)) ids.Add(item.TrashId);
            _save.RequestSave();
            _objectives.Signal(ObjectiveSignals.TrashCollected);
        }

        private void OnPointVisited(InspectionPoint point)
        {
            var ids = _save.Data.progression.visitedInspectionPointIds;
            if (ids.Contains(point.PointId)) return;
            ids.Add(point.PointId);
            _save.RequestSave();
            _objectives.Signal(ObjectiveSignals.InspectionPointVisited);
        }
    }
}
