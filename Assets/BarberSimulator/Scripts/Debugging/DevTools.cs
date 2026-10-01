#if UNITY_EDITOR || DEVELOPMENT_BUILD
using BarberSimulator.Barber;
using BarberSimulator.Customers;
using BarberSimulator.Economy;
using BarberSimulator.Haircut;
using UnityEngine;
using UnityEngine.InputSystem;

namespace BarberSimulator.Debugging
{
    /// <summary>
    /// Development shortcuts. Compiled only into the editor and development builds — never into release builds.
    /// F5 spawn customer · F6 +$100 · F7 reset hair · F8 complete current haircut perfectly · F9 hair zone overlay.
    /// </summary>
    public sealed class DevTools : MonoBehaviour
    {
        private CustomerSpawner _spawner;
        private EconomyService _economy;
        private BarberModeController _barber;
        private bool _overlay;

        public void Initialize(CustomerSpawner spawner, EconomyService economy, BarberModeController barber)
        {
            _spawner = spawner;
            _economy = economy;
            _barber = barber;
        }

        private void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.f5Key.wasPressedThisFrame && _spawner != null && _spawner.Config != null)
            {
                var profiles = _spawner.Config.profiles;
                _spawner.Spawn(profiles.Length > 0 ? profiles[Random.Range(0, profiles.Length)] : _spawner.Config.tutorialProfile);
                Debug.Log("[Dev] Customer spawned.");
            }
            if (keyboard.f6Key.wasPressedThisFrame && _economy != null) _economy.Add(100);
            if (keyboard.f7Key.wasPressedThisFrame && _barber != null && _barber.Session != null)
            {
                _barber.Session.Grid.Initialize(HairStyleLengths.GrownOut(), Random.Range(0, 9999));
                Debug.Log("[Dev] Hair reset.");
            }
            if (keyboard.f8Key.wasPressedThisFrame && _barber != null && _barber.Session != null) CompletePerfectly(_barber.Session);
            if (keyboard.f9Key.wasPressedThisFrame) _overlay = !_overlay;
        }

        /// <summary>Sets every requested zone to its target so the scoring/review/payment path can be tested quickly.</summary>
        private static void CompletePerfectly(HaircutSession session)
        {
            foreach (var target in session.Request.Targets)
            {
                var t = target;
                for (float lat = HairGrid.MinLatitude; lat <= HairGrid.MaxLatitude; lat += 2f)
                for (float lon = -180f; lon < 180f; lon += 3f)
                {
                    HairGrid.Classify(lon, lat, out bool grows, out var zone, out var band);
                    if (!grows || zone != t.zone || (t.band != HairBand.Any && band != t.band)) continue;
                    session.Grid.ApplyBrush(HairGrid.Direction(lon, lat), 1.5f, (ref HairGrid.Cell cell, float w) =>
                    {
                        cell.Length = Mathf.Min(cell.Length, t.length);
                        return 0f;
                    });
                }
            }
            Debug.Log("[Dev] Haircut completed to target lengths. Press Finish.");
        }

        private void OnGUI()
        {
            if (!_overlay || _barber == null || _barber.Session == null) return;
            var grid = _barber.Session.Grid;
            GUILayout.BeginArea(new Rect(10, 120, 360, 520), GUI.skin.box);
            GUILayout.Label("Hair zones (avg cm / touched)");
            foreach (HairZone zone in System.Enum.GetValues(typeof(HairZone)))
            {
                if (zone == HairZone.None) continue;
                if (HairZoneUtility.HasBands(zone))
                {
                    foreach (var band in new[] { HairBand.Lower, HairBand.Middle, HairBand.Upper })
                    {
                        var st = grid.Stats(zone, band);
                        GUILayout.Label($"{zone}/{band}: {st.Average:0.00} cm  {st.TouchedFraction:P0}");
                    }
                }
                else
                {
                    var st = grid.Stats(zone);
                    GUILayout.Label($"{zone}: {st.Average:0.00} cm  {st.TouchedFraction:P0}");
                }
            }
            var result = _barber.Session.Evaluate();
            GUILayout.Label($"Score {result.Total:0.00} ({result.Stars}★) acc {result.Accuracy:0.00} fade {result.FadeQuality:0.00} sym {result.Symmetry:0.00} done {result.Completion:0.00}");
            GUILayout.EndArea();
        }
    }
}
#endif
