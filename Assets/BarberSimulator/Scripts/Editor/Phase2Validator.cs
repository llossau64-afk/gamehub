using System.Collections.Generic;
using BarberSimulator.Barber;
using BarberSimulator.Customers;
using BarberSimulator.Haircut;
using BarberSimulator.Navigation;
using BarberSimulator.Player;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>Fails loudly on broken haircut/customer content instead of letting it break at runtime.</summary>
    public static class Phase2Validator
    {
        [MenuItem("Barber Simulator/Validate Customers & Haircuts", priority = 41)]
        public static void Validate()
        {
            var problems = new List<string>();

            foreach (var guid in AssetDatabase.FindAssets("t:HaircutRequest"))
            {
                var request = AssetDatabase.LoadAssetAtPath<HaircutRequest>(AssetDatabase.GUIDToAssetPath(guid));
                if (request.Targets.Count == 0) problems.Add($"HaircutRequest '{request.name}' has no target data.");
                if (request.AskLineKeys.Count == 0) problems.Add($"HaircutRequest '{request.name}' has no ask lines.");
                if (request.BasePrice <= 0) problems.Add($"HaircutRequest '{request.name}' has no price.");
            }

            foreach (var guid in AssetDatabase.FindAssets("t:BarberToolDefinition"))
            {
                var tool = AssetDatabase.LoadAssetAtPath<BarberToolDefinition>(AssetDatabase.GUIDToAssetPath(guid));
                if (tool.icon == null) problems.Add($"Tool '{tool.name}' has no icon.");
                if (tool.HasGuards && tool.guardLabels.Length != tool.guardLengths.Length) problems.Add($"Tool '{tool.name}' guard labels/lengths mismatch.");
            }

            foreach (var guid in AssetDatabase.FindAssets("t:CustomerSpawnConfig"))
            {
                var config = AssetDatabase.LoadAssetAtPath<CustomerSpawnConfig>(AssetDatabase.GUIDToAssetPath(guid));
                if (config.customerPrefab == null) { problems.Add("CustomerSpawnConfig has no customer prefab."); continue; }
                var prefab = config.customerPrefab;
                if (prefab.GetComponent<CustomerBrain>() == null) problems.Add("Customer prefab has no CustomerBrain.");
                if (prefab.GetComponent<Characters.ProceduralCharacterAnimator>() == null) problems.Add("Customer prefab has no animator.");
                var modular = prefab.GetComponent<Characters.ModularCharacter>();
                if (modular == null || prefab.GetComponentInChildren<HairShellRenderer>(true) == null) problems.Add("Customer prefab has no hair shell.");
                if (prefab.GetComponent<Collider>() == null) problems.Add("Customer prefab has no collider (cannot be talked to).");
                foreach (var profile in config.profiles)
                    if (profile != null && profile.possibleRequests.Length == 0 && profile.preferredRequest == null)
                        problems.Add($"CustomerProfile '{profile.name}' has no haircut requests.");
            }

            var scene = EditorSceneManager.GetActiveScene();
            foreach (var root in scene.GetRootGameObjects())
            {
                foreach (var chair in root.GetComponentsInChildren<BarberChairStation>(true))
                {
                    if (chair.SeatPoint == null) problems.Add($"Chair '{chair.name}' has no sit transform.");
                    if (chair.ApproachPoint == null) problems.Add($"Chair '{chair.name}' has no approach point.");
                    if (chair.GetComponent<Collider>() == null) problems.Add($"Chair '{chair.name}' has no interaction collider.");
                }
                foreach (var seat in root.GetComponentsInChildren<WaitingSeat>(true))
                    if (seat.SeatPoint == null || seat.ApproachPoint == null) problems.Add($"Waiting seat '{seat.name}' is missing points.");
                foreach (var site in root.GetComponentsInChildren<ShopCustomerSite>(true))
                {
                    if (site.Navigation == null) problems.Add("Customer site has no nav graph.");
                    if (site.DoorOutside == null || site.EntranceInside == null || site.ReceptionStand == null || site.RegisterStand == null)
                        problems.Add("Customer site is missing a navigation destination.");
                }
                foreach (var hands in root.GetComponentsInChildren<FirstPersonHands>(true))
                    if (hands.RightHandTool == null) problems.Add("First-person hands have no RightHandTool socket.");
                foreach (var barber in root.GetComponentsInChildren<BarberModeController>(true))
                    if (barber.Tools.Count == 0) problems.Add("Barber mode has no tools assigned.");
                foreach (var graph in root.GetComponentsInChildren<NavGraph>(true))
                    if (graph.Nodes.Count < 2) problems.Add("Nav graph has fewer than two nodes.");
            }

            if (problems.Count == 0) Debug.Log("[Validate] Customers & haircuts OK.");
            else foreach (var p in problems) Debug.LogError("[Validate] " + p);
        }
    }
}
