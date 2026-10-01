using System.Collections.Generic;
using BarberSimulator.Art;
using BarberSimulator.CameraSystems;
using BarberSimulator.Characters;
using BarberSimulator.Cinematics;
using BarberSimulator.Barber;
using BarberSimulator.Core;
using BarberSimulator.Customers;
using BarberSimulator.Haircut;
using BarberSimulator.Navigation;
using BarberSimulator.Environment;
using BarberSimulator.Interaction;
using BarberSimulator.NPC;
using BarberSimulator.Player;
using BarberSimulator.Shop;
using BarberSimulator.Workday;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Generates the complete Phase 1 scene: the small run-down barbershop, the street outside, the locked back
    /// room, lighting, menu/intro camera shots, NPCs, the player rig and the bootstrap wiring.
    ///
    /// Layout (metres): shop interior x ∈ [-4, 4], z ∈ [0, 9], ceiling 3.2. Street side is -Z.
    /// Entrance → waiting area (front left) → barber station (left wall) → locked back room (z > 9).
    /// </summary>
    public static class ShopSceneGenerator
    {
        private const float RoomHalfWidth = 4f;
        private const float RoomDepth = 9f;
        private const float CeilingHeight = 3.2f;
        private const float WallThickness = 0.2f;
        private const float FacadeHeight = 6.6f;
        private const float BackRoomDepth = 6f;

        private static MaterialLibrary m;
        private static PropFactory props;
        private static CharacterFactory characters;
        private static readonly List<AmbientMotion> Motions = new List<AmbientMotion>();
        private static readonly List<Light> ShadowLights = new List<Light>();

        [MenuItem("Barber Simulator/Build Project Content", priority = 0)]
        public static void BuildAllMenu()
        {
            if (EditorSceneManager.GetActiveScene().isDirty && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            BuildAll();
        }

        [MenuItem("Barber Simulator/Rebuild Scene Only", priority = 1)]
        public static void RebuildSceneMenu()
        {
            m = MaterialLibrary.CreateOrUpdate();
            var content = ContentAssetsBuilder.Build();
            BuildScene(content);
        }

        public static void BuildAll()
        {
            try
            {
                EditorUtility.DisplayProgressBar("Barber Simulator", "Configuring project...", 0.1f);
                ProjectSetup.ConfigureAll();
                EditorUtility.DisplayProgressBar("Barber Simulator", "Creating materials...", 0.3f);
                m = MaterialLibrary.CreateOrUpdate();
                EditorUtility.DisplayProgressBar("Barber Simulator", "Creating content...", 0.4f);
                var content = ContentAssetsBuilder.Build();
                EditorUtility.DisplayProgressBar("Barber Simulator", "Building the barbershop...", 0.6f);
                BuildScene(content);
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
        }

        private static void BuildScene(ContentAssetsBuilder.Result content)
        {
            Motions.Clear();
            ShadowLights.Clear();
            props = new PropFactory(m);
            characters = new CharacterFactory(m);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var environment = new GameObject("Environment").transform;
            var shell = Group(environment, "Shell");
            var exterior = Group(environment, "Exterior");
            var furniture = Group(environment, "Furniture");
            var lighting = Group(environment, "Lighting");
            var gameplay = new GameObject("Gameplay").transform;

            BuildShell(shell);
            BuildExterior(exterior);
            var backRoom = BuildBackRoom(environment);
            var refs = new SceneRefs { Phase3 = content.Phase3 };
            BuildFurniture(furniture, refs);
            BuildUpgradeProps(furniture, refs);
            BuildLighting(lighting, content);
            BuildGameplay(gameplay, refs, backRoom);
            BuildPlayerAndCamera(refs);
            BuildCinematics(refs);
            BuildMenuDressing(refs);
            refs.Phase2 = content.Phase2;
            BuildCustomerSystems(gameplay, refs);
            BuildBootstrap(content, refs);

            var driver = new GameObject("Ambient Motion").AddComponent<AmbientMotionDriver>();
            driver.SetMotions(new List<AmbientMotion>(Motions));

            MarkStatic(environment);
            SavePrefabs(refs);
            AssetUtility.EnsureFolder(GeneratorPaths.Scenes);
            if (!EditorSceneManager.SaveScene(scene, GeneratorPaths.MainScene))
                throw new System.InvalidOperationException("Could not save the generated scene to " + GeneratorPaths.MainScene);
            ProjectSetup.AddSceneToBuild(GeneratorPaths.MainScene);
            AssetDatabase.SaveAssets();
            Debug.Log("[Barber Simulator] Scene generated: " + GeneratorPaths.MainScene);
        }

        /// <summary>Scene objects created along the way and needed for wiring.</summary>
        private sealed class SceneRefs
        {
            public GameObject FrontDoor, BackDoor, Workstation, BarberChair, Owner;
            public Transform BarberChairSeat, BarberStand, WaitingSeat;
            public Renderer[] StationTools;
            public PlanarMirror Mirror;
            public ShopState Shop;
            public Transform Spawn;
            public FirstPersonController Player;
            public FirstPersonHands Hands;
            public Interactor Interactor;
            public PlayerAudio PlayerAudio;
            public Camera Camera;
            public CinematicCamera CinematicCamera;
            public MenuCameraDirector MenuDirector;
            public IntroSequence Intro;
            public GameObject MenuOnly;
            public readonly List<TrashPickup> Trash = new List<TrashPickup>();
            public readonly List<InspectionPoint> Points = new List<InspectionPoint>();
            public ExpansionArea Expansion;
            public readonly List<GameObject> WaitingChairs = new List<GameObject>();
            public BarberChairStation ChairStation;
            public BarberModeController BarberMode;
            public ShopCustomerSite Site;
            public CustomerSpawner Spawner;
            public Phase2ContentBuilder.Result Phase2;
            public Phase3ContentBuilder.Result Phase3;
            public ShopSign Sign;
            public ShopComputer Computer;
            public readonly List<UpgradeProp> UpgradeProps = new List<UpgradeProp>();
            public readonly List<GameObject> BenchChairs = new List<GameObject>();
        }

        // ================================================================== helpers

        private static Transform Group(Transform parent, string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go.transform;
        }

        private static GameObject Place(GameObject go, Transform parent, Vector3 position, float yaw = 0f, string name = null)
        {
            go.transform.SetParent(parent, false);
            go.transform.localPosition = position;
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            if (name != null) go.name = name;
            return go;
        }

        private static GameObject Solid(Transform parent, string name, Vector3 center, Vector3 size, Material material, float uvScale = 1f, float bevel = 0f, bool collider = true)
        {
            var builder = new MeshBuilder();
            builder.Box(Vector3.zero, size, 0, bevel, uvScale);
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = center;
            go.AddComponent<MeshFilter>().sharedMesh = AssetUtility.SaveMesh(builder.Build(name), "Shell_" + name);
            go.AddComponent<MeshRenderer>().sharedMaterial = material;
            if (collider) go.AddComponent<BoxCollider>().size = size;
            return go;
        }

        private static GameObject QuadObject(Transform parent, string name, Vector3 position, Quaternion rotation, Vector2 size, Material material, bool doubleSided = false)
        {
            var builder = new MeshBuilder();
            builder.Quad(Vector3.zero, size, 0, null, null, doubleSided);
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = position;
            go.transform.localRotation = rotation;
            go.AddComponent<MeshFilter>().sharedMesh = AssetUtility.SaveMesh(builder.Build(name), "Quad_" + name);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = ShadowCastingMode.Off;
            return go;
        }

        private static Transform Marker(Transform parent, string name, Vector3 position, Vector3 lookAt)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.position = position;
            t.rotation = Quaternion.LookRotation(lookAt - position, Vector3.up);
            return t;
        }

        private static WallBuilder InteriorFinish(Material upper)
        {
            return new WallBuilder()
                .AddLayer(m.PaintedWall, -WallThickness, 0f, 0f, CeilingHeight)
                .AddLayer(m.WoodDark, 0f, 0.025f, 0f, 1.05f, 0.004f, 1.2f)
                .AddLayer(m.Trim, 0f, 0.05f, 1.04f, 1.11f, 0.012f)
                .AddLayer(upper, 0f, 0.006f, 1.11f, CeilingHeight)
                .AddLayer(m.Trim, 0f, 0.045f, 0f, 0.13f, 0.008f)
                .AddLayer(m.Trim, 0f, 0.06f, CeilingHeight - 0.09f, CeilingHeight, 0.015f);
        }

        // ================================================================== shell

        private static void BuildShell(Transform shell)
        {
            // Floor in chunks so per-object light limits never starve a region of light.
            for (int ix = 0; ix < 4; ix++)
            for (int iz = 0; iz < 3; iz++)
            {
                float x0 = -RoomHalfWidth + ix * 2f;
                float z0 = iz * 3f;
                var builder = new MeshBuilder();
                builder.Box(new Vector3(x0 + 1f, -0.05f, z0 + 1.5f), new Vector3(2f, 0.1f, 3f), 0, 0f, 2.4f);
                var floor = new GameObject($"Floor_{ix}_{iz}");
                floor.transform.SetParent(shell, false);
                floor.AddComponent<MeshFilter>().sharedMesh = AssetUtility.SaveMesh(builder.Build(floor.name), "Shell_" + floor.name);
                floor.AddComponent<MeshRenderer>().sharedMaterial = m.FloorChecker;
                var col = floor.AddComponent<BoxCollider>();
                col.center = new Vector3(x0 + 1f, -0.05f, z0 + 1.5f);
                col.size = new Vector3(2f, 0.1f, 3f);
            }

            for (int ix = 0; ix < 2; ix++)
            for (int iz = 0; iz < 2; iz++)
                Solid(shell, $"Ceiling_{ix}_{iz}", new Vector3(-2f + ix * 4f, CeilingHeight + 0.05f, 2.25f + iz * 4.5f), new Vector3(4f, 0.1f, 4.5f), m.Ceiling, 1.2f);

            // Front wall (street side). Openings measured from x = -4 along +X.
            var front = new List<WallBuilder.Opening>
            {
                new WallBuilder.Opening(0.4f, 2.9f, 0.75f, 2.65f),  // display window  x -3.6 .. -0.7
                new WallBuilder.Opening(4.0f, 1.0f, 0f, 2.18f),     // door            x  0.0 ..  1.0
                new WallBuilder.Opening(5.6f, 2.0f, 1.0f, 2.5f)     // side window     x  1.6 ..  3.6
            };
            InteriorFinish(m.Wallpaper).Build(shell, "Wall_Front", new Vector3(-RoomHalfWidth, 0f, 0f), Vector3.right, Vector3.forward, RoomHalfWidth * 2f, CeilingHeight, front, true);

            // Exterior brick skin incl. upper storey.
            var facadeOpenings = new List<WallBuilder.Opening>(front)
            {
                new WallBuilder.Opening(0.9f, 1.3f, 4.1f, 5.7f),
                new WallBuilder.Opening(3.35f, 1.3f, 4.1f, 5.7f),
                new WallBuilder.Opening(5.8f, 1.3f, 4.1f, 5.7f)
            };
            new WallBuilder()
                .AddLayer(m.Brick, -0.1f, 0.02f, 0f, FacadeHeight, 0f, 1.6f)
                .AddLayer(m.Trim, 0f, 0.07f, 3.48f, 3.62f, 0.02f)
                .AddLayer(m.Trim, 0f, 0.1f, FacadeHeight - 0.25f, FacadeHeight, 0.03f)
                .Build(shell, "Facade", new Vector3(RoomHalfWidth + 0.2f, 0f, -WallThickness), Vector3.left, Vector3.back, RoomHalfWidth * 2f + 0.4f, FacadeHeight, ShiftOpenings(facadeOpenings, 0.2f, RoomHalfWidth * 2f), false);

            var leftOpenings = new List<WallBuilder.Opening>();
            InteriorFinish(m.Wallpaper).Build(shell, "Wall_Left", new Vector3(-RoomHalfWidth, 0f, RoomDepth), Vector3.back, Vector3.right, RoomDepth, CeilingHeight, leftOpenings, true);
            InteriorFinish(m.Wallpaper).Build(shell, "Wall_Right", new Vector3(RoomHalfWidth, 0f, 0f), Vector3.forward, Vector3.left, RoomDepth, CeilingHeight, null, true);

            // Back wall with the locked door (x 0.1..1.1) and an interior window into the back room.
            var back = new List<WallBuilder.Opening>
            {
                new WallBuilder.Opening(RoomHalfWidth - 1.1f, 1.0f, 0f, 2.12f),
                new WallBuilder.Opening(RoomHalfWidth + 0.8f, 1.6f, 1.0f, 2.1f)
            };
            InteriorFinish(m.Plaster).Build(shell, "Wall_Back", new Vector3(RoomHalfWidth, 0f, RoomDepth), Vector3.left, Vector3.back, RoomHalfWidth * 2f, CeilingHeight, back, true);

            // Window frames + glass.
            Place(props.WindowFrame(2.9f, 1.9f), shell, new Vector3(-2.15f, 1.7f, -0.1f), 0f, "Frame_DisplayWindow");
            Place(props.WindowFrame(2.0f, 1.5f), shell, new Vector3(2.6f, 1.75f, -0.1f), 0f, "Frame_SideWindow");
            Place(props.WindowFrame(1.6f, 1.1f), shell, new Vector3(-1.6f, 1.55f, RoomDepth + 0.1f), 180f, "Frame_BackRoomWindow");
            foreach (var x in new[] { -2.45f, 0f, 2.45f })
            {
                Place(props.WindowFrame(1.3f, 1.6f), shell, new Vector3(x, 4.9f, -0.28f), 180f, "Frame_Upper");
                QuadObject(shell, "UpperWindow_Dark", new Vector3(x, 4.9f, -0.21f), Quaternion.Euler(0f, 180f, 0f), new Vector2(1.3f, 1.6f), m.PlasticBlack);
            }

            // Glass panes need colliders so the player cannot walk through the windows.
            Solid(shell, "WindowBlocker_Display", new Vector3(-2.15f, 1.7f, -0.1f), new Vector3(2.9f, 1.9f, 0.1f), m.Glass, 1f, 0f).GetComponent<MeshRenderer>().enabled = false;
            Solid(shell, "WindowBlocker_Side", new Vector3(2.6f, 1.75f, -0.1f), new Vector3(2.0f, 1.5f, 0.1f), m.Glass, 1f, 0f).GetComponent<MeshRenderer>().enabled = false;
            Solid(shell, "WindowBlocker_Back", new Vector3(-1.6f, 1.55f, RoomDepth + 0.1f), new Vector3(1.6f, 1.1f, 0.2f), m.Glass, 1f, 0f).GetComponent<MeshRenderer>().enabled = false;

            // Threshold under the front door so the floor and the sidewalk meet cleanly.
            Solid(shell, "Threshold", new Vector3(0.5f, -0.015f, -0.1f), new Vector3(1.0f, 0.05f, 0.24f), m.WoodDark, 0.5f, 0.008f);

            // Doormat and a scuffed spot where the second chair will go one day.
            Solid(shell, "Doormat", new Vector3(0.5f, 0.006f, 0.65f), new Vector3(1.1f, 0.012f, 0.7f), m.VinylDark, 0.5f, 0.004f, false);
            QuadObject(shell, "OldMirrorGhost", new Vector3(-RoomHalfWidth + 0.012f, 1.62f, 7.35f), Quaternion.Euler(0f, 90f, 0f), new Vector2(1.25f, 0.95f), m.PaintedWall);
        }

        /// <summary>The facade is built from +X towards -X and starts 0.2 m further out; convert front-wall openings.</summary>
        private static List<WallBuilder.Opening> ShiftOpenings(List<WallBuilder.Opening> openings, float pad, float innerLength)
        {
            var result = new List<WallBuilder.Opening>();
            foreach (var o in openings)
            {
                float startFromRight = innerLength - (o.Start + o.Width);
                result.Add(new WallBuilder.Opening(startFromRight + pad, o.Width, o.Bottom, o.Top));
            }
            return result;
        }

        // ================================================================== exterior

        private static void BuildExterior(Transform exterior)
        {
            Solid(exterior, "Sidewalk", new Vector3(0f, -0.06f, -2.2f), new Vector3(30f, 0.12f, 4f), m.Concrete, 1.5f);
            Solid(exterior, "Curb", new Vector3(0f, -0.07f, -4.28f), new Vector3(30f, 0.14f, 0.18f), m.Concrete, 1f, 0.02f);
            Solid(exterior, "Road", new Vector3(0f, -0.2f, -8.4f), new Vector3(30f, 0.1f, 8f), m.Asphalt, 3f);
            Solid(exterior, "FarSidewalk", new Vector3(0f, -0.06f, -14f), new Vector3(30f, 0.12f, 3.6f), m.Concrete, 1.5f);

            // Invisible bounds so the player can step outside but not wander off.
            var bounds = Group(exterior, "Bounds");
            Solid(bounds, "Bound_Curb", new Vector3(0f, 1f, -4.1f), new Vector3(12f, 2f, 0.2f), m.Concrete).GetComponent<MeshRenderer>().enabled = false;
            Solid(bounds, "Bound_Left", new Vector3(-5.8f, 1f, -2.2f), new Vector3(0.2f, 2f, 4f), m.Concrete).GetComponent<MeshRenderer>().enabled = false;
            Solid(bounds, "Bound_Right", new Vector3(5.8f, 1f, -2.2f), new Vector3(0.2f, 2f, 4f), m.Concrete).GetComponent<MeshRenderer>().enabled = false;

            // Neighbouring buildings.
            Solid(exterior, "Neighbour_Left", new Vector3(-9.3f, FacadeHeight * 0.5f, -0.3f), new Vector3(10f, FacadeHeight, 0.2f), m.PaintedWall, 1.5f);
            Solid(exterior, "Neighbour_Right", new Vector3(9.3f, 5f * 0.5f + 0.4f, -0.3f), new Vector3(10f, 5.8f, 0.2f), m.Brick, 1.6f);
            for (int i = 0; i < 3; i++)
            {
                QuadObject(exterior, "Neighbour_Window", new Vector3(-6.2f - i * 2.6f, 1.6f, -0.41f), Quaternion.Euler(0f, 180f, 0f), new Vector2(1.6f, 1.9f), m.PlasticBlack);
                QuadObject(exterior, "Neighbour_Window", new Vector3(6.4f + i * 2.4f, 4.6f, -0.41f), Quaternion.Euler(0f, 180f, 0f), new Vector2(1.1f, 1.4f), m.PlasticBlack);
            }

            // Shop sign, window lettering, awning and barber pole.
            QuadObject(exterior, "ShopSign", new Vector3(-1.0f, 3.12f, -0.33f), Quaternion.Euler(0f, 180f, 0f), new Vector2(3.4f, 0.85f), m.SignBoard);
            Solid(exterior, "ShopSign_Back", new Vector3(-1.0f, 3.12f, -0.27f), new Vector3(3.5f, 0.95f, 0.1f), m.Trim, 1f, 0.02f, false);
            QuadObject(exterior, "WindowLettering", new Vector3(-2.15f, 1.72f, -0.14f), Quaternion.Euler(0f, 180f, 0f), new Vector2(2.5f, 1.25f), m.WindowDecal);

            var awning = new MeshBuilder();
            awning.Box(Vector3.zero, new Vector3(3.3f, 0.04f, 1.15f), 0, 0.01f, 0.6f);
            awning.Box(new Vector3(0f, -0.11f, -0.57f), new Vector3(3.3f, 0.22f, 0.025f), 0, 0.005f, 0.6f);
            var awningGo = new GameObject("Awning");
            awningGo.transform.SetParent(exterior, false);
            awningGo.transform.localPosition = new Vector3(-2.15f, 2.78f, -0.78f);
            awningGo.transform.localRotation = Quaternion.Euler(-22f, 0f, 0f);
            awningGo.AddComponent<MeshFilter>().sharedMesh = AssetUtility.SaveMesh(awning.Build("Awning"), "Shell_Awning");
            awningGo.AddComponent<MeshRenderer>().sharedMaterial = m.VinylGreen;

            var pole = Place(props.BarberPole(), exterior, new Vector3(1.32f, 1.95f, -0.2f), 180f, "BarberPole");
            AddRotator(pole.transform.Find("Stripes"), 55f, 0f);

            Place(props.StreetLamp(), exterior, new Vector3(-5.2f, 0f, -3.75f), 0f, "StreetLamp_A");
            Place(props.StreetLamp(), exterior, new Vector3(6.8f, 0f, -3.75f), 0f, "StreetLamp_B");
            Place(props.TrashBin(), exterior, new Vector3(-4.6f, 0f, -3.6f), 0f, "StreetBin");

            // Backdrop across the street and soft passers-by in front of it.
            QuadObject(exterior, "StreetBackdrop", new Vector3(0f, 4.6f, -16f), Quaternion.identity, new Vector2(34f, 10f), m.StreetBackdrop);
            var walkers = new List<Transform>();
            for (int i = 0; i < 3; i++)
            {
                var walker = QuadObject(exterior, "Passerby_" + i, new Vector3(0f, 0.92f, -13.2f - i * 0.5f), Quaternion.identity, new Vector2(0.75f, 1.8f), m.Passerby, true);
                walkers.Add(walker.transform);
            }
            var passersby = Group(exterior, "Passersby").gameObject.AddComponent<StreetPasserby>();
            passersby.Configure(walkers.ToArray(), -14f, 14f);
            Motions.Add(passersby);
        }

        // ================================================================== back room (future expansion)

        private static ExpansionArea BuildBackRoom(Transform environment)
        {
            var room = Group(environment, "BackRoom_Expansion");
            float z0 = RoomDepth + WallThickness;
            Solid(room, "Floor", new Vector3(0f, -0.05f, z0 + BackRoomDepth * 0.5f), new Vector3(8f, 0.1f, BackRoomDepth), m.WoodFloor, 2f);
            Solid(room, "Ceiling", new Vector3(0f, CeilingHeight + 0.05f, z0 + BackRoomDepth * 0.5f), new Vector3(8f, 0.1f, BackRoomDepth), m.PaintedWall, 2f);
            Solid(room, "Wall_Left", new Vector3(-RoomHalfWidth - 0.1f, CeilingHeight * 0.5f, z0 + BackRoomDepth * 0.5f), new Vector3(0.2f, CeilingHeight, BackRoomDepth), m.PaintedWall, 1.5f);
            Solid(room, "Wall_Right", new Vector3(RoomHalfWidth + 0.1f, CeilingHeight * 0.5f, z0 + BackRoomDepth * 0.5f), new Vector3(0.2f, CeilingHeight, BackRoomDepth), m.PaintedWall, 1.5f);
            Solid(room, "Wall_Far", new Vector3(0f, CeilingHeight * 0.5f, z0 + BackRoomDepth + 0.1f), new Vector3(8f, CeilingHeight, 0.2f), m.Plaster, 1.5f);

            Place(props.Ladder(), room, new Vector3(-1.4f, 0f, z0 + 2.2f), 25f);
            Place(props.PaintBucket(true), room, new Vector3(-0.6f, 0f, z0 + 1.2f), 0f);
            Place(props.PaintBucket(false), room, new Vector3(-0.3f, 0f, z0 + 1.45f), 40f);
            Place(props.PaintBucket(true), room, new Vector3(-2.6f, 0f, z0 + 3.4f), 10f);
            Place(props.CoveredChair(), room, new Vector3(-2.8f, 0f, z0 + 1.6f), 70f);
            Place(props.CoveredChair(), room, new Vector3(2.2f, 0f, z0 + 3.9f), -120f);
            Place(props.CardboardBox(new Vector3(0.6f, 0.45f, 0.5f), false), room, new Vector3(2.8f, 0f, z0 + 1.0f), 12f);
            Place(props.CardboardBox(new Vector3(0.5f, 0.4f, 0.45f), true), room, new Vector3(2.75f, 0.45f, z0 + 1.0f), -8f);
            QuadObject(room, "PlasticSheet", new Vector3(0.4f, 1.6f, z0 + 2.6f), Quaternion.Euler(0f, 8f, 0f), new Vector2(3.2f, 3.0f), m.PlasticSheet, true);

            var bulb = Place(props.PendantLamp(0.5f), room, new Vector3(-0.8f, CeilingHeight, z0 + 2.4f), 0f, "BareBulb");
            var light = PointLight(room, "BackRoom_Light", new Vector3(-0.8f, CeilingHeight - 0.75f, z0 + 2.4f), new Color(1f, 0.74f, 0.45f), 0.55f, 5.5f);
            var flicker = light.gameObject.AddComponent<LightFlicker>();
            flicker.Configure(light, FindRenderer(bulb.transform, "Bulb"), 0.12f, 2.2f, 0.004f);
            Motions.Add(flicker);

            var area = room.gameObject.AddComponent<ExpansionArea>();
            return area;
        }

        // ================================================================== furniture

        private static void BuildFurniture(Transform root, SceneRefs refs)
        {
            // Waiting area (front left, along the left wall, facing into the room).
            var waiting = Group(root, "WaitingArea");
            for (int i = 0; i < 3; i++)
            {
                var chair = Place(props.WaitingChair(m.VinylGreen), waiting, new Vector3(-3.55f, 0f, 1.45f + i * 0.68f), 90f, "WaitingChair_" + i);
                if (i == 1) refs.WaitingSeat = chair.transform.Find("SeatPoint");
                refs.WaitingChairs.Add(chair);
            }
            Place(props.MagazineTable(), waiting, new Vector3(-3.5f, 0f, 3.75f), 90f);
            Place(props.Plant(), waiting, new Vector3(-3.6f, 0f, 0.45f), 30f);
            Place(props.CoatRack(), waiting, new Vector3(-0.4f, 0f, 0.42f), 15f);
            Place(props.Radiator(1.2f), waiting, new Vector3(-2.15f, 0f, 0.03f), 0f);

            // Reception (front right).
            var reception = Group(root, "Reception");
            var counter = Place(props.ReceptionCounter(), reception, new Vector3(2.75f, 0f, 2.2f), -90f);
            Place(props.CashRegister(), reception, new Vector3(2.9f, 0.94f, 2.35f), 90f);
            Place(props.WallClock(), reception, new Vector3(RoomHalfWidth - 0.01f, 2.35f, 2.2f), -90f);
            Place(props.TowelStack(2), reception, new Vector3(2.85f, 0.94f, 1.75f), 70f);
            _ = counter;

            // Barber station (left wall).
            var station = Group(root, "BarberStation");
            refs.Workstation = Place(props.Workstation(), station, new Vector3(-3.72f, 0f, 5.2f), 90f, "Workstation");
            refs.BarberChair = Place(props.BarberChair(), station, new Vector3(-2.5f, 0f, 5.2f), -90f, "BarberChair");
            refs.BarberChairSeat = refs.BarberChair.transform.Find("SeatPoint");
            refs.BarberStand = refs.BarberChair.transform.Find("BarberStandPoint");

            var surface = refs.Workstation.transform.Find("ToolSurface");
            var tools = new List<Renderer>();
            GameObject Tool(GameObject prop, Vector3 local, float yaw)
            {
                prop.transform.SetParent(surface != null ? surface : refs.Workstation.transform, false);
                prop.transform.localPosition = local;
                prop.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
                tools.AddRange(prop.GetComponentsInChildren<Renderer>());
                return prop;
            }
            Tool(props.Clipper(), new Vector3(-0.15f, 0f, 0.02f), 75f);
            Tool(props.Scissors(), new Vector3(0.08f, 0f, 0.06f), -20f);
            Tool(props.Comb(), new Vector3(0.22f, 0f, 0.0f), 10f);
            Tool(props.SprayBottle(), new Vector3(-0.55f, 0f, -0.08f), 30f);
            var towels = props.TowelStack(3);
            towels.transform.SetParent(surface != null ? surface : refs.Workstation.transform, false);
            towels.transform.localPosition = new Vector3(0.55f, 0f, -0.04f);
            var products = props.ProductBottles(3);
            products.transform.SetParent(surface != null ? surface : refs.Workstation.transform, false);
            products.transform.localPosition = new Vector3(-0.32f, 0f, -0.14f);
            var toolParent = surface != null ? surface : refs.Workstation.transform;
            void Extra(GameObject prop, Vector3 local, float yaw)
            {
                foreach (var c in prop.GetComponentsInChildren<Collider>()) Object.DestroyImmediate(c);
                prop.transform.SetParent(toolParent, false);
                prop.transform.localPosition = local;
                prop.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            }
            Extra(props.CounterMat(), new Vector3(0.02f, 0f, 0.04f), 0f);
            Extra(props.BarbicideJar(), new Vector3(-0.68f, 0f, -0.13f), 0f);
            Extra(props.DisinfectantBottle(), new Vector3(0.72f, 0f, -0.15f), 0f);
            Extra(props.ClipperDock(), new Vector3(0.36f, 0f, -0.12f), -12f);
            refs.StationTools = tools.ToArray();

            // Mirror with real planar reflection.
            var mirrorRotation = Quaternion.Euler(0f, 90f, 0f);
            Place(props.MirrorFrame(1.3f, 1.0f), station, new Vector3(-RoomHalfWidth + 0.02f, 1.58f, 5.2f), 90f, "MirrorFrame");
            var mirror = QuadObject(station, "Mirror", new Vector3(-RoomHalfWidth + 0.035f, 1.58f, 5.2f), mirrorRotation, new Vector2(1.3f, 1.0f), m.Mirror);
            refs.Mirror = mirror.AddComponent<PlanarMirror>();

            Place(props.PowerOutlet(), station, new Vector3(-RoomHalfWidth + 0.03f, 0.32f, 6.05f), 90f);
            Place(props.PowerOutlet(), station, new Vector3(-RoomHalfWidth + 0.03f, 0.32f, 7.35f), 90f);

            // Right wall: shelving, poster, radiator.
            var right = Group(root, "RightWall");
            var shelf = Place(props.WallShelf(1.1f, 4), right, new Vector3(3.76f, 0f, 4.9f), -90f, "ProductShelf");
            for (int i = 1; i < 4; i++)
            {
                var board = shelf.transform.Find("Shelf_" + i);
                if (board == null) continue;
                var cluster = props.ProductBottles(10 + i);
                cluster.transform.SetParent(board, false);
            }
            var boardBottom = shelf.transform.Find("Shelf_0");
            if (boardBottom != null)
            {
                var box = props.CardboardBox(new Vector3(0.45f, 0.3f, 0.32f), false);
                box.transform.SetParent(boardBottom, false);
            }
            Place(props.PriceBoard(), right, new Vector3(RoomHalfWidth - 0.01f, 1.62f, 3.05f), -90f, "PriceBoard");
            QuadObject(right, "Poster", new Vector3(RoomHalfWidth - 0.012f, 1.7f, 6.4f), Quaternion.Euler(0f, -90f, 0f), new Vector2(0.6f, 0.9f), m.Poster);
            Place(props.Radiator(1.0f), right, new Vector3(RoomHalfWidth - 0.03f, 0f, 3.6f), -90f);
            Place(props.PowerOutlet(), right, new Vector3(RoomHalfWidth - 0.03f, 0.32f, 4.2f), -90f);
            Place(props.LightSwitch(), right, new Vector3(-0.3f, 1.25f, 0.02f), 0f);

            // Storage corner (back right).
            var storage = Group(root, "Storage");
            Place(props.Locker(), storage, new Vector3(3.55f, 0f, 8.6f), 180f);
            Place(props.CardboardBox(new Vector3(0.6f, 0.45f, 0.45f), false), storage, new Vector3(2.55f, 0f, 8.62f), 4f);
            Place(props.CardboardBox(new Vector3(0.5f, 0.38f, 0.42f), true), storage, new Vector3(2.6f, 0.45f, 8.6f), -10f);
            Place(props.CardboardBox(new Vector3(0.45f, 0.35f, 0.4f), false), storage, new Vector3(1.95f, 0f, 8.55f), 18f);
            var broom = Place(props.Broom(), storage, new Vector3(3.84f, 0.02f, 7.35f), 0f, "Broom");
            broom.transform.localRotation = Quaternion.Euler(0f, 0f, 9f);
            Place(props.TrashBin(), storage, new Vector3(1.4f, 0f, 8.7f), 0f);
            Place(props.PaintBucket(true), storage, new Vector3(3.0f, 0f, 7.8f), 0f);

            // Ceiling fixtures.
            var ceiling = Group(root, "CeilingFixtures");
            var fan = Place(props.CeilingFan(), ceiling, new Vector3(0.2f, CeilingHeight, 4.6f), 0f, "CeilingFan");
            AddRotator(fan.transform.Find("Rotor"), 75f, 0.35f);
            Place(props.PendantLamp(0.85f), ceiling, new Vector3(-2.5f, CeilingHeight, 2.2f), 0f, "Pendant_Waiting");
            Place(props.PendantLamp(0.9f), ceiling, new Vector3(-2.5f, CeilingHeight, 5.2f), 0f, "Pendant_Chair");
            Place(props.PendantLamp(0.85f), ceiling, new Vector3(2.6f, CeilingHeight, 2.2f), 0f, "Pendant_Reception");
            Place(props.PendantLamp(0.6f), ceiling, new Vector3(2.9f, CeilingHeight, 8.0f), 0f, "Pendant_Storage");
        }

        // ================================================================== upgrade props

        /// <summary>Starts the container of one upgrade's scene props. It is hidden once all upgrade props exist.</summary>
        private static Transform UpgradeGroup(Transform root, SceneRefs refs, string upgradeId)
        {
            var definition = refs.Phase3 != null ? refs.Phase3.Find(upgradeId) : null;
            var go = new GameObject(definition != null && !string.IsNullOrEmpty(definition.scenePropName) ? definition.scenePropName : "Upgrade_" + upgradeId);
            go.transform.SetParent(root, false);
            go.AddComponent<UpgradeProp>().Configure(upgradeId);
            refs.UpgradeProps.Add(go.GetComponent<UpgradeProp>());
            return go.transform;
        }

        /// <summary>
        /// Everything the shop computer sells that you can see: built into the scene but disabled; ShopState enables
        /// the props of owned upgrades (see UpgradeProp).
        /// </summary>
        private static void BuildUpgradeProps(Transform root, SceneRefs refs)
        {
            if (refs.Phase3 == null) return;
            var upgrades = Group(root, "Upgrades");

            // Coffee machine: a small station against the right wall by the entrance.
            var coffee = UpgradeGroup(upgrades, refs, "coffee_machine");
            Place(props.CoffeeStation(), coffee, new Vector3(3.55f, 0f, 0.72f), -90f, "CoffeeStation");

            // Plants and posters.
            var decor = UpgradeGroup(upgrades, refs, "plants_posters");
            Place(props.Plant(), decor, new Vector3(3.55f, 0f, 3.3f), 20f, "BigPlant_Counter").transform.localScale = Vector3.one * 1.7f;
            Place(props.Plant(), decor, new Vector3(-0.65f, 0f, 8.55f), 70f, "BigPlant_Back").transform.localScale = Vector3.one * 1.4f;
            QuadObject(decor, "Poster_Right", new Vector3(RoomHalfWidth - 0.012f, 1.75f, 3.72f), Quaternion.Euler(0f, -90f, 0f), new Vector2(0.55f, 0.8f), m.Poster);
            QuadObject(decor, "Poster_Back", new Vector3(-3.2f, 1.7f, RoomDepth - 0.012f), Quaternion.Euler(0f, 180f, 0f), new Vector2(0.6f, 0.85f), m.Poster);

            // Wall TV above the waiting chairs.
            var tv = UpgradeGroup(upgrades, refs, "wall_tv");
            Place(props.WallTv(), tv, new Vector3(-RoomHalfWidth + 0.02f, 2.05f, 2.15f), 90f, "WallTv");

            // Second waiting bench on the right wall. The seats are registered with the customer site later.
            var bench = UpgradeGroup(upgrades, refs, "second_bench");
            for (int i = 0; i < 2; i++)
                refs.BenchChairs.Add(Place(props.WaitingChair(m.VinylGreen), bench, new Vector3(3.55f, 0f, 6.0f + i * 0.68f), -90f, "WaitingChair_B" + i));

            // Neon sign in the display window, readable from the street.
            var neon = UpgradeGroup(upgrades, refs, "neon_sign");
            Place(props.NeonSign(), neon, new Vector3(-2.15f, 1.9f, 0.14f), 0f, "NeonSign");
            PointLight(neon, "NeonGlow", new Vector3(-2.15f, 1.85f, 0.5f), new Color(1f, 0.3f, 0.6f), 0.8f, 3.4f);

            // Premium products shelf on the left wall behind the second chair.
            var shelfGroup = UpgradeGroup(upgrades, refs, "premium_shelf");
            var shelf = Place(props.WallShelf(0.8f, 4), shelfGroup, new Vector3(-RoomHalfWidth + 0.24f, 0f, 8.58f), 90f, "PremiumShelf");
            for (int i = 1; i < 4; i++)
            {
                var board = shelf.transform.Find("Shelf_" + i);
                if (board == null) continue;
                props.ProductBottles(30 + i).transform.SetParent(board, false);
            }

            // Placeholder for the second barber chair (an employee will work it in a later update).
            var chair = UpgradeGroup(upgrades, refs, "second_chair");
            Place(props.BarberChair(), chair, new Vector3(-2.5f, 0f, 7.35f), -90f, "BarberChair_2");
            Place(props.Workstation(), chair, new Vector3(-3.72f, 0f, 7.35f), 90f, "Workstation_2");
            Place(props.MirrorFrame(1.3f, 1.0f), chair, new Vector3(-RoomHalfWidth + 0.02f, 1.58f, 7.35f), 90f, "MirrorFrame_2");
            QuadObject(chair, "Mirror_2", new Vector3(-RoomHalfWidth + 0.035f, 1.58f, 7.35f), Quaternion.Euler(0f, 90f, 0f), new Vector2(1.3f, 1.0f), m.ChromeDark);

            // Hidden until bought.
            foreach (var prop in refs.UpgradeProps) prop.gameObject.SetActive(false);
        }

        private static void AddRotator(Transform target, float speed, float wobble)
        {
            if (target == null) return;
            var rotator = target.gameObject.AddComponent<Rotator>();
            rotator.Configure(Vector3.up, speed, wobble);
            Motions.Add(rotator);
        }

        private static Renderer FindRenderer(Transform root, string name)
        {
            var t = root.Find(name);
            if (t == null)
                foreach (var r in root.GetComponentsInChildren<Renderer>(true))
                    if (r.name == name) return r;
            return t != null ? t.GetComponent<Renderer>() : null;
        }

        // ================================================================== lighting

        private static Light PointLight(Transform parent, string name, Vector3 position, Color color, float intensity, float range)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = position;
            var light = go.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.intensity = intensity;
            light.range = range;
            light.shadows = LightShadows.None;
            light.lightmapBakeType = LightmapBakeType.Mixed;
            return light;
        }

        private static void BuildLighting(Transform lighting, ContentAssetsBuilder.Result content)
        {
            // Late-afternoon sun from the street side, throwing window light across the checker floor.
            var sunGo = new GameObject("Sun");
            sunGo.transform.SetParent(lighting, false);
            sunGo.transform.rotation = Quaternion.Euler(24f, 18f, 0f);
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.82f, 0.6f);
            sun.intensity = 1.9f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.92f;
            sun.shadowBias = 0.04f;
            sun.shadowNormalBias = 0.3f;
            sun.lightmapBakeType = LightmapBakeType.Mixed;
            RenderSettings.sun = sun;
            ShadowLights.Add(sun);

            var warm = new Color(1f, 0.76f, 0.5f);
            PointLight(lighting, "Light_Waiting", new Vector3(-2.5f, 2.2f, 2.2f), warm, 1.25f, 5f);
            PointLight(lighting, "Light_Chair", new Vector3(-2.5f, 2.15f, 5.2f), warm, 1.4f, 4.5f);
            // Work light: keeps the customer's hair readable while cutting without flattening the scene.
            var workLightGo = new GameObject("Light_HaircutSpot");
            workLightGo.transform.SetParent(lighting, false);
            workLightGo.transform.position = new Vector3(-1.75f, 2.85f, 5.2f);
            workLightGo.transform.rotation = Quaternion.LookRotation(new Vector3(-2.55f, 1.45f, 5.2f) - workLightGo.transform.position);
            var workLight = workLightGo.AddComponent<Light>();
            workLight.type = LightType.Spot;
            workLight.color = new Color(1f, 0.93f, 0.84f);
            workLight.intensity = 2.6f;
            workLight.range = 4f;
            workLight.spotAngle = 52f;
            workLight.innerSpotAngle = 25f;
            workLight.shadows = LightShadows.None;
            PointLight(lighting, "Light_Reception", new Vector3(2.6f, 2.2f, 2.2f), warm, 1.0f, 4.5f);
            var storageLight = PointLight(lighting, "Light_Storage", new Vector3(2.9f, 2.45f, 8.0f), new Color(1f, 0.82f, 0.62f), 0.7f, 4f);
            var flicker = storageLight.gameObject.AddComponent<LightFlicker>();
            flicker.Configure(storageLight, null, 0.08f, 1.6f, 0.0015f);
            Motions.Add(flicker);
            PointLight(lighting, "Light_StreetFill", new Vector3(0.5f, 2.6f, -2.5f), new Color(0.75f, 0.8f, 0.9f), 0.6f, 7f);

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.46f, 0.44f, 0.42f);
            RenderSettings.ambientEquatorColor = new Color(0.33f, 0.29f, 0.25f);
            RenderSettings.ambientGroundColor = new Color(0.13f, 0.11f, 0.09f);
            RenderSettings.skybox = null;
            RenderSettings.fog = false;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;

            var probeGo = new GameObject("ReflectionProbe_Shop");
            probeGo.transform.SetParent(lighting, false);
            probeGo.transform.localPosition = new Vector3(0f, 1.6f, 4.5f);
            var probe = probeGo.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
            probe.resolution = 128;
            probe.boxProjection = true;
            probe.size = new Vector3(8.2f, 3.4f, 9.2f);
            probe.intensity = 0.9f;

            var volumeGo = new GameObject("PostProcessing");
            volumeGo.transform.SetParent(lighting, false);
            var volume = volumeGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.sharedProfile = content.PostProcessing;
        }

        // ================================================================== gameplay objects

        private static void BuildGameplay(Transform gameplay, SceneRefs refs, ExpansionArea backRoom)
        {
            var shopGo = new GameObject("Shop");
            shopGo.transform.SetParent(gameplay, false);
            refs.Shop = shopGo.AddComponent<ShopState>();
            var interactables = Group(shopGo.transform, "Interactables");

            // Front door.
            refs.FrontDoor = Place(props.FrontDoor(), interactables, new Vector3(0.5f, 0f, -0.1f), 0f, "FrontDoor");
            var door = refs.FrontDoor.AddComponent<SwingDoor>();
            var hinge = refs.FrontDoor.transform.Find("Hinge");
            door.Configure(hinge, -92f, "interact.front_door");
            if (hinge != null) door.SetHighlightRenderers(hinge.GetComponentsInChildren<Renderer>());

            // Open/Closed sign (left of the front door) and the shop computer on the reception counter.
            var signGo = Place(props.OpenClosedSign(), interactables, new Vector3(-0.38f, 1.78f, 0.012f), 0f, "OpenClosedSign");
            refs.Sign = signGo.AddComponent<ShopSign>();
            refs.Sign.Configure(signGo.transform.Find("Board"));
            refs.Sign.SetHighlightRenderers(signGo.GetComponentsInChildren<Renderer>());

            var laptop = Place(props.Laptop(), interactables, new Vector3(2.92f, 0.94f, 2.72f), 90f, "ShopComputer");
            refs.Computer = laptop.AddComponent<ShopComputer>();
            refs.Computer.SetHighlightRenderers(laptop.GetComponentsInChildren<Renderer>());

            // Locked back door into the future expansion.
            refs.BackDoor = Place(props.BackDoor(), interactables, new Vector3(0.6f, 0f, RoomDepth + 0.1f), 180f, "BackDoor_Locked");
            var locked = refs.BackDoor.AddComponent<LockedDoor>();
            locked.Configure(refs.BackDoor.transform.Find("Leaf"), "interact.expansion_door", "toast.expansion_locked");
            backRoom.Configure("back_room", "area.back_room", 1500, locked, null, null);
            refs.Expansion = backRoom;

            // Barber station interaction lives on the workstation.
            var station = refs.Workstation.AddComponent<BarberStation>();
            station.SetHighlightRenderers(refs.StationTools);

            // Trash.
            var trashRoot = Group(shopGo.transform, "Trash");
            AddTrash(trashRoot, refs, props.CrumpledPaper(), "trash_paper", "interact.trash.paper", new Vector3(-2.85f, 0f, 2.6f), 40f);
            AddTrash(trashRoot, refs, props.SodaCan(true), "trash_can", "interact.trash.can", new Vector3(1.8f, 0f, 2.95f), 110f);
            AddTrash(trashRoot, refs, props.PizzaBox(), "trash_pizza", "interact.trash.pizza", new Vector3(2.35f, 0f, 7.45f), -18f);
            AddTrash(trashRoot, refs, props.NewspaperPile(), "trash_newspaper", "interact.trash.newspaper", new Vector3(-1.7f, 0f, 0.95f), 25f);
            AddTrash(trashRoot, refs, props.EmptyBottle(), "trash_bottle", "interact.trash.bottle", new Vector3(-1.45f, 0f, 6.35f), 70f);

            // Inspection points.
            var pointsRoot = Group(shopGo.transform, "InspectionPoints");
            AddPoint(pointsRoot, refs, "waiting_area", new Vector3(-2.7f, 1f, 2.3f), new Vector3(2.2f, 2f, 2.8f));
            AddPoint(pointsRoot, refs, "barber_chair", new Vector3(-2.2f, 1f, 5.2f), new Vector3(2.4f, 2f, 2.2f));
            AddPoint(pointsRoot, refs, "back_of_shop", new Vector3(0.4f, 1f, 8.1f), new Vector3(3.6f, 2f, 1.6f));

            refs.Spawn = new GameObject("GameplaySpawn").transform;
            refs.Spawn.SetParent(shopGo.transform, false);
            refs.Spawn.position = new Vector3(0.35f, 0.02f, 2.2f);
            refs.Spawn.rotation = Quaternion.Euler(0f, -18f, 0f);

            refs.Shop.Configure(refs.Trash, refs.Points, new List<ExpansionArea> { backRoom }, door, refs.Spawn);
            refs.Shop.SetUpgradeProps(refs.UpgradeProps);
        }

        private static void AddTrash(Transform parent, SceneRefs refs, GameObject prop, string id, string label, Vector3 position, float yaw)
        {
            Place(prop, parent, position, yaw, "Trash_" + id);
            var pickup = prop.AddComponent<TrashPickup>();
            pickup.Configure(id, label);
            refs.Trash.Add(pickup);
        }

        private static void AddPoint(Transform parent, SceneRefs refs, string id, Vector3 center, Vector3 size)
        {
            var go = new GameObject("Inspect_" + id);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = center;
            var box = go.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.size = size;
            var point = go.AddComponent<InspectionPoint>();
            point.Configure(id);
            refs.Points.Add(point);
        }

        // ================================================================== player & camera

        private static void BuildPlayerAndCamera(SceneRefs refs)
        {
            var player = new GameObject("Player");
            player.transform.position = refs.Spawn.position;
            player.transform.rotation = refs.Spawn.rotation;
            player.layer = 2; // Ignore Raycast
            var controller = player.AddComponent<CharacterController>();
            controller.height = 1.75f;
            controller.radius = 0.28f;
            controller.center = new Vector3(0f, 0.875f, 0f);
            controller.stepOffset = 0.3f;
            controller.slopeLimit = 45f;
            controller.skinWidth = 0.03f;
            controller.minMoveDistance = 0f;

            var head = new GameObject("Head").transform;
            head.SetParent(player.transform, false);
            head.localPosition = new Vector3(0f, 1.62f, 0f);

            refs.Player = player.AddComponent<FirstPersonController>();
            refs.Player.Configure(head);
            refs.Interactor = player.AddComponent<Interactor>();
            refs.PlayerAudio = player.AddComponent<PlayerAudio>();

            // First-person arms.
            var handsRoot = new GameObject("Hands").transform;
            handsRoot.SetParent(head, false);
            var rightArm = characters.CreateFirstPersonArm(handsRoot, "RightArm", true, new Color(0.82f, 0.8f, 0.76f), new Color(0.86f, 0.68f, 0.54f));
            var leftArm = characters.CreateFirstPersonArm(handsRoot, "LeftArm", false, new Color(0.82f, 0.8f, 0.76f), new Color(0.86f, 0.68f, 0.54f));
            var rightSocket = new GameObject("RightHandTool").transform;
            rightSocket.SetParent(rightArm.transform, false);
            rightSocket.localPosition = new Vector3(0f, 0.02f, 0.11f);
            var leftSocket = new GameObject("LeftHandSupport").transform;
            leftSocket.SetParent(leftArm.transform, false);
            leftSocket.localPosition = new Vector3(0f, 0.02f, 0.11f);

            var clipper = props.Clipper();
            clipper.transform.SetParent(rightSocket, false);
            clipper.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
            foreach (var r in clipper.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = ShadowCastingMode.Off;
            foreach (var c in clipper.GetComponentsInChildren<Collider>()) Object.DestroyImmediate(c);

            GameObject HandTool(GameObject prop, Quaternion rotation)
            {
                prop.transform.SetParent(rightSocket, false);
                prop.transform.localRotation = rotation;
                foreach (var r in prop.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = ShadowCastingMode.Off;
                foreach (var c in prop.GetComponentsInChildren<Collider>()) Object.DestroyImmediate(c);
                return prop;
            }
            var trimmer = HandTool(props.TrimmerTool(), Quaternion.Euler(0f, 0f, 90f));
            var scissors = HandTool(props.Scissors(), Quaternion.Euler(0f, 0f, 90f));
            var comb = HandTool(props.Comb(), Quaternion.Euler(0f, 0f, 90f));

            refs.Hands = handsRoot.gameObject.AddComponent<FirstPersonHands>();
            refs.Hands.Configure(rightArm.transform, leftArm.transform, rightSocket, leftSocket,
                new List<FirstPersonHands.ToolVisual>
                {
                    new FirstPersonHands.ToolVisual { type = HandToolType.Clipper, visual = clipper },
                    new FirstPersonHands.ToolVisual { type = HandToolType.Trimmer, visual = trimmer },
                    new FirstPersonHands.ToolVisual { type = HandToolType.Scissors, visual = scissors },
                    new FirstPersonHands.ToolVisual { type = HandToolType.Comb, visual = comb }
                });

            // The single camera shared by menu, intro and gameplay.
            var rig = new GameObject("Camera Rig");
            refs.CinematicCamera = rig.AddComponent<CinematicCamera>();
            var cameraGo = new GameObject("Main Camera");
            cameraGo.tag = "MainCamera";
            cameraGo.transform.SetParent(rig.transform, false);
            refs.Camera = cameraGo.AddComponent<Camera>();
            refs.Camera.nearClipPlane = 0.03f;
            refs.Camera.farClipPlane = 70f;
            refs.Camera.fieldOfView = 50f;
            refs.Camera.clearFlags = CameraClearFlags.SolidColor;
            refs.Camera.backgroundColor = new Color(0.56f, 0.6f, 0.64f);
            cameraGo.AddComponent<AudioListener>();
            var cameraData = cameraGo.AddComponent<UniversalAdditionalCameraData>();
            cameraData.renderPostProcessing = true;
            cameraData.antialiasing = AntialiasingMode.None;
            refs.CinematicCamera.Configure(refs.Camera);
            refs.Mirror.Configure(refs.Camera);
        }

        // ================================================================== cinematics

        private static CameraShot Shot(Transform parent, string name, Vector3 startPos, Vector3 startLook, Vector3 endPos, Vector3 endLook, float fovStart, float fovEnd, float duration, float handheld)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var start = Marker(go.transform, "Start", startPos, startLook);
            var end = Marker(go.transform, "End", endPos, endLook);
            var shot = go.AddComponent<CameraShot>();
            shot.Configure(start, end, fovStart, fovEnd, duration, handheld);
            return shot;
        }

        private static void BuildCinematics(SceneRefs refs)
        {
            var root = new GameObject("Cinematics").transform;

            // Main menu: five slow shots.
            var menuShots = Group(root, "MenuShots");
            var shots = new List<CameraShot>
            {
                Shot(menuShots, "Shot_Exterior", new Vector3(-3.2f, 1.45f, -5.6f), new Vector3(-1.4f, 1.75f, 0f), new Vector3(-1.0f, 1.5f, -5.0f), new Vector3(-0.6f, 1.8f, 0f), 44f, 42f, 10f, 0.4f),
                Shot(menuShots, "Shot_ChairGlide", new Vector3(-0.9f, 1.05f, 3.7f), new Vector3(-2.7f, 0.95f, 5.35f), new Vector3(-1.05f, 1.15f, 6.5f), new Vector3(-2.7f, 1.0f, 5.1f), 48f, 46f, 9f, 0.35f),
                Shot(menuShots, "Shot_Tools", new Vector3(-3.05f, 1.32f, 4.55f), new Vector3(-3.72f, 0.88f, 5.15f), new Vector3(-3.05f, 1.26f, 5.85f), new Vector3(-3.72f, 0.88f, 5.25f), 36f, 34f, 8f, 0.3f),
                Shot(menuShots, "Shot_Mirror", new Vector3(-1.3f, 1.62f, 4.2f), new Vector3(-4f, 1.5f, 5.35f), new Vector3(-1.45f, 1.64f, 4.6f), new Vector3(-4f, 1.52f, 5.2f), 44f, 42f, 8f, 0.3f),
                Shot(menuShots, "Shot_Wide", new Vector3(3.3f, 2.45f, 8.4f), new Vector3(-1.2f, 1.0f, 1.8f), new Vector3(2.6f, 2.3f, 7.7f), new Vector3(-1.8f, 1.0f, 2.6f), 54f, 52f, 10f, 0.25f)
            };
            refs.MenuDirector = root.gameObject.AddComponent<MenuCameraDirector>();
            refs.MenuDirector.SetShots(shots);

            // Intro.
            var intro = Group(root, "Intro");
            var approachStart = Marker(intro, "ApproachStart", new Vector3(-0.6f, 1.55f, -5.4f), new Vector3(0.3f, 1.5f, 0f));
            var approach = Marker(intro, "ApproachTarget", new Vector3(0.45f, 1.6f, -2.4f), new Vector3(0.5f, 1.35f, 0f));
            var street = Shot(intro, "Shot_Street", new Vector3(-0.55f, 1.62f, -3.4f), new Vector3(0.95f, 1.55f, -1.35f), new Vector3(-0.35f, 1.62f, -3.05f), new Vector3(0.9f, 1.55f, -1.35f), 40f, 38f, 12f, 0.45f);
            var doorShot = Shot(intro, "Shot_Door", new Vector3(-1.15f, 1.45f, -1.75f), new Vector3(0.5f, 1.25f, 0f), new Vector3(-0.95f, 1.5f, -1.45f), new Vector3(0.55f, 1.2f, 0f), 46f, 44f, 6f, 0.35f);
            var enter = Shot(intro, "Shot_Enter", new Vector3(0.5f, 1.62f, -1.3f), new Vector3(0.45f, 1.5f, 3f), new Vector3(0.6f, 1.62f, 1.05f), new Vector3(-0.6f, 1.45f, 5f), 55f, 58f, 3.8f, 0.3f);
            var reveal = Shot(intro, "Shot_Reveal", new Vector3(0.6f, 1.62f, 1.05f), new Vector3(-2.8f, 1.2f, 5f), new Vector3(0.7f, 1.62f, 1.3f), new Vector3(1.5f, 1.2f, 8f), 58f, 62f, 9f, 0.25f);

            var ownerOutside = Marker(intro, "Owner_Outside", new Vector3(0.95f, 0f, -1.35f), new Vector3(-0.5f, 0f, -3.4f));
            var ownerDoor = Marker(intro, "Owner_Door", new Vector3(0.55f, 0f, -0.55f), new Vector3(0.55f, 0f, 1f));
            var ownerInside = Marker(intro, "Owner_Inside", new Vector3(1.35f, 0f, 3.3f), new Vector3(0.6f, 0f, 1f));
            var ownerPass = Marker(intro, "Owner_Pass", new Vector3(1.3f, 0f, 1.0f), new Vector3(0.6f, 0f, -0.5f));
            var ownerExit = Marker(intro, "Owner_Exit", new Vector3(5.2f, 0f, -2.3f), new Vector3(8f, 0f, -2.3f));

            var ownerAppearance = new CharacterAppearanceData
            {
                skinTone = new Color(0.86f, 0.68f, 0.55f),
                hairStyle = HairStyle.SidePart,
                hairColor = new Color(0.62f, 0.6f, 0.58f),
                facialHair = FacialHairStyle.Moustache,
                topStyle = 1,
                topColor = new Color(0.36f, 0.27f, 0.2f),
                pantsColor = new Color(0.2f, 0.19f, 0.18f),
                shoeColor = new Color(0.22f, 0.13f, 0.08f),
                accessory = CharacterAccessory.Glasses,
                heightScale = 0.98f,
                buildScale = 1.05f
            };
            refs.Owner = characters.Create("PreviousOwner", ownerAppearance, withMotor: true);
            refs.Owner.transform.SetParent(root, false);
            refs.Owner.transform.position = ownerOutside.position;
            refs.Owner.transform.rotation = ownerOutside.rotation;

            refs.Intro = intro.gameObject.AddComponent<IntroSequence>();
            refs.Intro.Configure(approachStart, approach, street, doorShot, enter, reveal, refs.Owner.GetComponent<NpcMotor>(), refs.Owner.GetComponent<ProceduralCharacterAnimator>(),
                ownerOutside, ownerDoor, ownerInside, ownerPass, ownerExit, refs.FrontDoor.GetComponent<SwingDoor>());
        }

        // ================================================================== menu-only life

        private static void BuildMenuDressing(SceneRefs refs)
        {
            var root = new GameObject("MenuOnly");
            refs.MenuOnly = root;

            var barberLook = new CharacterAppearanceData
            {
                skinTone = new Color(0.63f, 0.44f, 0.31f), hairStyle = HairStyle.Pompadour, hairColor = new Color(0.08f, 0.06f, 0.05f),
                facialHair = FacialHairStyle.FullBeard, topStyle = 0, topColor = new Color(0.9f, 0.89f, 0.86f),
                pantsColor = new Color(0.12f, 0.12f, 0.14f), shoeColor = new Color(0.08f, 0.07f, 0.06f), heightScale = 1.02f, buildScale = 1f
            };
            var barber = characters.Create("Ambient_Barber", barberLook, withMotor: false);
            barber.transform.SetParent(root.transform, false);
            // Beside the chair, cutting from the side, out of the menu camera paths (they glide behind the chair).
            var seat = refs.BarberChairSeat.position;
            var barberPos = new Vector3(seat.x + 0.22f, refs.BarberStand.position.y, seat.z + 0.6f);
            var toChair = seat - barberPos;
            toChair.y = 0f; // stand upright: the seat is higher than the barber's floor point
            barber.transform.SetPositionAndRotation(barberPos, Quaternion.LookRotation(toChair, Vector3.up));
            var barberHead = refs.BarberChairSeat;
            barber.AddComponent<AmbientNpc>().Configure(barber.GetComponent<ProceduralCharacterAnimator>(), CharacterPose.Stand, barberHead, talks: true, null, cutting: true);
            var barberHand = barber.transform.Find("Body/Pelvis/Spine/UpperArmR/ForearmR");
            if (barberHand != null)
            {
                var heldClipper = props.Clipper();
                foreach (var c in heldClipper.GetComponentsInChildren<Collider>()) Object.DestroyImmediate(c);
                heldClipper.transform.SetParent(barberHand, false);
                heldClipper.transform.localPosition = new Vector3(0f, -0.33f, 0.03f);
                heldClipper.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            }
            // The customer in the chair wears a cape in the menu shot.
            var menuCape = props.Cape();
            menuCape.transform.SetParent(root.transform, false);
            menuCape.transform.position = new Vector3(refs.BarberChairSeat.position.x, 1.36f, refs.BarberChairSeat.position.z);
            menuCape.transform.rotation = Quaternion.Euler(0f, refs.BarberChairSeat.eulerAngles.y, 0f);

            var customerLook = new CharacterAppearanceData
            {
                skinTone = new Color(0.89f, 0.7f, 0.56f), hairStyle = HairStyle.Short, hairColor = new Color(0.36f, 0.24f, 0.14f),
                facialHair = FacialHairStyle.Stubble, topStyle = 0, topColor = new Color(0.32f, 0.4f, 0.5f),
                pantsColor = new Color(0.2f, 0.18f, 0.16f), shoeColor = new Color(0.32f, 0.2f, 0.12f), heightScale = 1f, buildScale = 1f
            };
            var customer = characters.Create("Ambient_CustomerInChair", customerLook, withMotor: false);
            customer.transform.SetParent(root.transform, false);
            Seating.PlaceOnSeat(customer.transform, customer.GetComponent<ProceduralCharacterAnimator>(), refs.BarberChairSeat);
            var mirrorPoint = new GameObject("CustomerLook").transform;
            mirrorPoint.SetParent(root.transform, false);
            mirrorPoint.position = new Vector3(-RoomHalfWidth, 1.45f, 5.2f);
            customer.AddComponent<AmbientNpc>().Configure(customer.GetComponent<ProceduralCharacterAnimator>(), CharacterPose.Sit, mirrorPoint, talks: true, refs.BarberChairSeat);

            var waitingLook = new CharacterAppearanceData
            {
                skinTone = new Color(0.47f, 0.32f, 0.22f), hairStyle = HairStyle.Curly, hairColor = new Color(0.08f, 0.06f, 0.05f),
                facialHair = FacialHairStyle.None, topStyle = 1, topColor = new Color(0.24f, 0.31f, 0.22f),
                pantsColor = new Color(0.24f, 0.28f, 0.38f), shoeColor = new Color(0.1f, 0.08f, 0.07f), accessory = CharacterAccessory.Cap, heightScale = 0.97f, buildScale = 0.98f
            };
            var waiting = characters.Create("Ambient_Waiting", waitingLook, withMotor: false);
            waiting.transform.SetParent(root.transform, false);
            if (refs.WaitingSeat != null)
            {
                Seating.PlaceOnSeat(waiting.transform, waiting.GetComponent<ProceduralCharacterAnimator>(), refs.WaitingSeat);
                var lap = new GameObject("WaitingLook").transform;
                lap.SetParent(root.transform, false);
                lap.position = refs.WaitingSeat.position + refs.WaitingSeat.forward * 0.45f + Vector3.up * 0.1f;
                waiting.AddComponent<AmbientNpc>().Configure(waiting.GetComponent<ProceduralCharacterAnimator>(), CharacterPose.Sit, lap, talks: false, refs.WaitingSeat);
            }
        }

        // ================================================================== bootstrap

        private static void BuildBootstrap(ContentAssetsBuilder.Result content, SceneRefs refs)
        {
            var go = new GameObject("GameBootstrap");
            go.transform.SetAsFirstSibling();
            var bootstrap = go.AddComponent<GameBootstrap>();
            var scene = new SceneReferences
            {
                MainCamera = refs.Camera,
                CinematicCamera = refs.CinematicCamera,
                MenuDirector = refs.MenuDirector,
                Intro = refs.Intro,
                Player = refs.Player,
                Hands = refs.Hands,
                Interactor = refs.Interactor,
                PlayerAudio = refs.PlayerAudio,
                Shop = refs.Shop,
                Mirror = refs.Mirror,
                MenuOnly = refs.MenuOnly,
                ShadowLights = ShadowLights.ToArray(),
                BarberMode = refs.BarberMode,
                CustomerSite = refs.Site,
                CustomerSpawner = refs.Spawner,
                Sign = refs.Sign,
                Computer = refs.Computer
            };
            bootstrap.Configure(content.Config, scene);

            // Start the camera on the first menu shot so the editor view matches what players see.
            var first = refs.MenuDirector.Shots[0];
            refs.Camera.transform.SetPositionAndRotation(first.StartPoint.position, first.StartPoint.rotation);
            refs.Camera.fieldOfView = first.StartFov;
        }

        /// <summary>
        /// Customer infrastructure: the walk graph (always through the real door), the barber chair station,
        /// waiting seats, the customer site/queue, the spawner and the barber mode controller.
        /// </summary>
        private static void BuildCustomerSystems(Transform gameplay, SceneRefs refs)
        {
            var root = Group(gameplay, "Customers");

            // ---- walk graph
            var graphGo = new GameObject("NavGraph");
            graphGo.transform.SetParent(root, false);
            var nodes = new List<Transform>();
            Transform Node(string name, Vector3 position, float yaw = 0f)
            {
                var t = new GameObject(name).transform;
                t.SetParent(graphGo.transform, false);
                t.position = position;
                t.rotation = Quaternion.Euler(0f, yaw, 0f);
                nodes.Add(t);
                return t;
            }
            var streetL = Node("Street_L", new Vector3(-6.5f, 0f, -2.6f), 90f);
            var streetR = Node("Street_R", new Vector3(7f, 0f, -2.6f), -90f);
            var doorOutside = Node("DoorOutside", new Vector3(0.5f, 0f, -1.0f), 0f);
            var doorInside = Node("DoorInside", new Vector3(0.5f, 0f, 0.75f), 0f);
            var entrance = Node("Entrance", new Vector3(0.6f, 0f, 1.6f), 0f);
            var reception = Node("Reception", new Vector3(1.9f, 0f, 2.3f), 90f);
            var register = Node("Register", new Vector3(1.9f, 0f, 1.75f), 90f);
            var waitingHub = Node("WaitingArea", new Vector3(-2.3f, 0f, 2.15f), -90f);
            var chairArea = Node("ChairArea", new Vector3(-1.5f, 0f, 5.75f), -90f);

            var seatPoint = refs.BarberChairSeat;
            var chairApproach = Node("ChairApproach", new Vector3(seatPoint.position.x, 0f, seatPoint.position.z + 0.7f), seatPoint.eulerAngles.y);

            var links = new List<NavGraph.Link>();
            void Link(Transform a, Transform b) => links.Add(new NavGraph.Link { a = a, b = b });
            Link(streetL, doorOutside); Link(streetR, doorOutside); Link(doorOutside, doorInside); Link(doorInside, entrance);
            Link(entrance, reception); Link(entrance, register); Link(reception, register); Link(entrance, waitingHub);
            Link(entrance, chairArea); Link(reception, chairArea); Link(chairArea, chairApproach); Link(waitingHub, chairArea);

            var seats = new List<WaitingSeat>();
            for (int i = 0; i < refs.WaitingChairs.Count; i++)
            {
                var chair = refs.WaitingChairs[i];
                var seat = chair.transform.Find("SeatPoint");
                var approach = Node("WaitApproach_" + i, new Vector3(seat.position.x + 0.55f, 0f, seat.position.z), seat.eulerAngles.y);
                Link(waitingHub, approach);
                var waitingSeat = chair.AddComponent<WaitingSeat>();
                waitingSeat.Configure(seat, approach);
                seats.Add(waitingSeat);
            }

            // Upgrade bench (right wall): inactive seats until bought, but the walk nodes always exist.
            if (refs.BenchChairs.Count > 0)
            {
                var benchHub = Node("WaitingArea_Bench", new Vector3(2.2f, 0f, 6.3f), 90f);
                Link(benchHub, chairArea); Link(benchHub, reception);
                for (int i = 0; i < refs.BenchChairs.Count; i++)
                {
                    var chair = refs.BenchChairs[i];
                    var seat = chair.transform.Find("SeatPoint");
                    var approach = Node("BenchApproach_" + i, new Vector3(seat.position.x - 0.55f, 0f, seat.position.z), seat.eulerAngles.y);
                    Link(benchHub, approach);
                    var waitingSeat = chair.AddComponent<WaitingSeat>();
                    waitingSeat.Configure(seat, approach);
                    seats.Add(waitingSeat);
                }
            }

            var graph = graphGo.AddComponent<NavGraph>();
            graph.Configure(nodes, links);

            // ---- barber chair station
            var station = refs.BarberChair.AddComponent<BarberChairStation>();
            var cape = props.Cape();
            cape.transform.SetParent(refs.BarberChair.transform, false);
            cape.transform.position = new Vector3(seatPoint.position.x, 1.36f, seatPoint.position.z);
            cape.transform.rotation = Quaternion.Euler(0f, seatPoint.eulerAngles.y, 0f);
            var debris = props.HairDebris(0.75f);
            debris.transform.SetParent(refs.BarberChair.transform, false);
            debris.transform.localPosition = new Vector3(0f, 0.002f, 0.05f);
            var mirrorLook = new GameObject("MirrorLookPoint").transform;
            mirrorLook.SetParent(refs.BarberChair.transform, false);
            mirrorLook.position = new Vector3(-RoomHalfWidth, 1.5f, seatPoint.position.z);
            var headrest = refs.BarberChair.transform.Find("Headrest");
            station.Configure("chair_1", seatPoint, chairApproach, mirrorLook, cape, debris.GetComponentInChildren<Renderer>(),
                headrest != null ? new[] { headrest.gameObject } : new GameObject[0]);
            refs.ChairStation = station;

            // ---- site, spawner, barber mode
            var siteGo = new GameObject("CustomerSite");
            siteGo.transform.SetParent(root, false);
            refs.Site = siteGo.AddComponent<ShopCustomerSite>();
            refs.Site.Configure(graph, new[] { streetL, streetR }, doorOutside, entrance, reception, register,
                refs.FrontDoor.GetComponent<SwingDoor>(), new List<BarberChairStation> { station }, seats);

            var pool = new GameObject("CustomerPool").transform;
            pool.SetParent(root, false);
            refs.Spawner = siteGo.AddComponent<CustomerSpawner>();
            refs.Spawner.Configure(refs.Phase2 != null ? refs.Phase2.SpawnConfig : null, refs.Site, pool);

            var barberGo = new GameObject("BarberMode");
            barberGo.transform.SetParent(root, false);
            refs.BarberMode = barberGo.AddComponent<BarberModeController>();
            refs.BarberMode.Configure(refs.Phase2 != null ? refs.Phase2.Tools : new BarberToolDefinition[0], m.HairParticles);
        }

        /// <summary>
        /// Stores the key pieces as prefabs (kept connected to the scene instances) so later phases can spawn
        /// customers, add chairs or reuse props without regenerating the scene.
        /// </summary>
        private static void SavePrefabs(SceneRefs refs)
        {
            AssetUtility.SavePrefab(refs.BarberChair, GeneratorPaths.PrefabsEnvironment, "BarberChair");
            AssetUtility.SavePrefab(refs.Workstation, GeneratorPaths.PrefabsGameplay, "BarberStation");
            AssetUtility.SavePrefab(refs.FrontDoor, GeneratorPaths.PrefabsGameplay, "FrontDoor");
            AssetUtility.SavePrefab(refs.BackDoor, GeneratorPaths.PrefabsGameplay, "LockedExpansionDoor");
            foreach (var trash in refs.Trash)
                AssetUtility.SavePrefab(trash.gameObject, GeneratorPaths.PrefabsGameplay + "/Trash", trash.name);
            AssetUtility.SavePrefab(refs.Owner, GeneratorPaths.PrefabsCharacters, "PreviousOwner");

            // A pool-ready customer template for the customer phase: modular body + motor + brain.
            var customer = characters.Create("Customer", CharacterAppearanceData.CreateRandom(new System.Random(42)), withMotor: true);
            customer.AddComponent<CustomerBrain>().Configure(customer.GetComponent<ProceduralCharacterAnimator>(), customer.GetComponent<ModularCharacter>());
            var capsule = customer.AddComponent<CapsuleCollider>();
            capsule.center = new Vector3(0f, 0.9f, 0f);
            capsule.height = 1.75f;
            capsule.radius = 0.24f;
            capsule.isTrigger = true; // interaction target only; NPCs never push the player around
            customer.AddComponent<CustomerInteractable>();
            customer.SetActive(false);
            AssetUtility.EnsureFolder(GeneratorPaths.PrefabsCharacters);
            var customerPrefab = PrefabUtility.SaveAsPrefabAsset(customer, GeneratorPaths.PrefabsCharacters + "/Customer.prefab");
            Object.DestroyImmediate(customer);
            if (refs.Phase2 != null && refs.Phase2.SpawnConfig != null)
            {
                refs.Phase2.SpawnConfig.customerPrefab = customerPrefab;
                EditorUtility.SetDirty(refs.Phase2.SpawnConfig);
            }
        }

        private static void MarkStatic(Transform root)
        {
            const StaticEditorFlags flags = StaticEditorFlags.BatchingStatic | StaticEditorFlags.ContributeGI |
                                            StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.ReflectionProbeStatic;
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
            {
                // Anything animated or interactive stays dynamic.
                if (t.GetComponentInParent<AmbientMotion>() != null) continue;
                if (t.GetComponent<Light>() != null) continue;
                if (t.name.StartsWith("Passerby") || t.name == "PlasticSheet") continue;
                GameObjectUtility.SetStaticEditorFlags(t.gameObject, flags);
            }
        }
    }
}
