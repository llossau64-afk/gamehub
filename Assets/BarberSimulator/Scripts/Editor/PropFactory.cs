using System;
using System.Collections.Generic;
using UnityEngine;
using BarberSimulator.Art;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Builds every procedural prop of the barbershop (furniture, tools, trash, doors, fixtures).
    /// Conventions: metres, pivot on the floor at the footprint centre, front faces +Z, +Y up.
    /// Each public method returns a NEW unparented root GameObject whose meshes are saved assets.
    /// </summary>
    public sealed class PropFactory
    {
        private readonly MaterialLibrary m;
        private readonly Dictionary<string, Mesh> _cache = new Dictionary<string, Mesh>();

        public PropFactory(MaterialLibrary materials) { m = materials; }

        // ------------------------------------------------------------------ helpers

        /// <summary>Builds (or reuses) a mesh via the callback, saves it, and adds a child GameObject rendering it.</summary>
        public GameObject Part(Transform parent, string name, string meshName, Material[] mats, Action<MeshBuilder> build,
            Vector3 localPos = default(Vector3), Quaternion? localRot = null)
        {
            return PartFromMesh(parent, name, meshName, mats, () =>
            {
                var mb = new MeshBuilder();
                build(mb);
                return mb.Build(meshName, mats.Length);
            }, localPos, localRot);
        }

        private GameObject PartFromMesh(Transform parent, string name, string meshName, Material[] mats, Func<Mesh> make,
            Vector3 localPos, Quaternion? localRot)
        {
            Mesh mesh;
            if (!_cache.TryGetValue(meshName, out mesh) || mesh == null)
            {
                mesh = AssetUtility.SaveMesh(make(), meshName);
                _cache[meshName] = mesh;
            }
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localRotation = localRot ?? Quaternion.identity;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterials = mats;
            return go;
        }

        private static Vector3 V(float x, float y, float z) { return new Vector3(x, y, z); }
        private static Material[] M(params Material[] a) { return a; }
        private static Quaternion Rx(float a) { return Quaternion.Euler(a, 0f, 0f); }
        private static Quaternion Ry(float a) { return Quaternion.Euler(0f, a, 0f); }
        private static Quaternion Rz(float a) { return Quaternion.Euler(0f, 0f, a); }
        private static Matrix4x4 TRS(Vector3 p, Quaternion r) { return Matrix4x4.TRS(p, r, Vector3.one); }

        /// <summary>Profile from (radius, height) pairs.</summary>
        private static Vector2[] Pr(params float[] v)
        {
            var list = new Vector2[v.Length / 2];
            for (int i = 0; i < list.Length; i++) list[i] = new Vector2(v[i * 2], v[i * 2 + 1]);
            return list;
        }

        private static GameObject Root(string n) { return new GameObject(n); }

        private static Transform Marker(Transform parent, string n, Vector3 pos)
        {
            var g = new GameObject(n);
            g.transform.SetParent(parent, false);
            g.transform.localPosition = pos;
            return g.transform;
        }

        private static BoxCollider Col(GameObject go, Vector3 center, Vector3 size)
        {
            var bc = go.AddComponent<BoxCollider>();
            bc.center = center;
            bc.size = size;
            return bc;
        }

        /// <summary>Cylinder between two points.</summary>
        private static void Tube(MeshBuilder b, Vector3 a, Vector3 c, float r, int seg, int sub, bool caps = true)
        {
            var d = c - a;
            float len = d.magnitude;
            if (len < 1e-5f) return;
            b.Cylinder((a + c) * 0.5f, r, len, seg, sub, 0.5f, Quaternion.FromToRotation(Vector3.up, d / len), caps);
        }

        /// <summary>Flat bar between two points: width along local X, thickness along local Y (oriented by 'up').</summary>
        private static void Bar(MeshBuilder b, Vector3 a, Vector3 c, float w, float t, int sub, float bevel = 0.002f, Vector3? up = null)
        {
            var d = c - a;
            float len = d.magnitude;
            if (len < 1e-5f) return;
            var dir = d / len;
            var u = up ?? Vector3.up;
            if (Mathf.Abs(Vector3.Dot(dir, u.normalized)) > 0.98f) u = Vector3.forward;
            b.Box((a + c) * 0.5f, new Vector3(w, t, len), sub, bevel, 0.5f, Quaternion.LookRotation(dir, u), 1);
        }

        private static float Hash(float x, float y, float z)
        {
            float s = Mathf.Sin(x * 127.1f + y * 311.7f + z * 74.7f) * 43758.5453f;
            return s - Mathf.Floor(s);
        }

        // ================================================================== 1. Barber chair

        public GameObject BarberChair()
        {
            var root = Root("BarberChair");

            Part(root.transform, "Base", "BarberChair_Base", M(m.Chrome, m.MetalDark), b =>
            {
                // Round cast base flowing into the hydraulic column.
                b.Lathe(V(0, 0, 0), Pr(0.27f, 0f, 0.30f, 0.012f, 0.30f, 0.03f, 0.27f, 0.055f, 0.20f, 0.078f, 0.14f, 0.095f,
                    0.095f, 0.115f, 0.075f, 0.14f, 0.072f, 0.30f, 0.076f, 0.306f, 0.076f, 0.32f, 0.058f, 0.326f,
                    0.058f, 0.36f, 0.044f, 0.364f, 0.044f, 0.50f), 32, 0, true, true, 0.5f);
                // Rubber skirt under the base.
                b.Torus(V(0, 0.008f, 0), 0.285f, 0.009f, 32, 8, 1);
                // Pump lever.
                Tube(b, V(0.08f, 0.17f, 0), V(0.26f, 0.12f, -0.04f), 0.01f, 10, 0);
                b.Cylinder(V(0.27f, 0.118f, -0.042f), 0.016f, 0.03f, 12, 1, 0.1f, Rz(90f));
                // Footrest: arm, plate, front lip and rubber ribs.
                Tube(b, V(0, 0.30f, 0.06f), V(0, 0.225f, 0.34f), 0.02f, 12, 0);
                b.Box(V(0, 0.215f, 0.42f), V(0.42f, 0.02f, 0.22f), 0, 0.008f, 0.5f);
                b.Box(V(0, 0.236f, 0.522f), V(0.42f, 0.03f, 0.016f), 0, 0.006f, 0.5f);
                for (int i = 0; i < 7; i++)
                    b.Box(V(0, 0.229f, 0.34f + i * 0.026f), V(0.34f, 0.008f, 0.014f), 1, 0.003f, 0.2f);
                // Mounting screws.
                for (int i = 0; i < 4; i++)
                    b.Cylinder(V(i < 2 ? -0.18f : 0.18f, 0.2255f, i % 2 == 0 ? 0.32f : 0.36f), 0.004f, 0.002f, 8, 1, 0.1f);
            });

            Part(root.transform, "Seat", "BarberChair_Seat", M(m.Chrome, m.Leather, m.MetalDark), b =>
            {
                // Seat pan + tilt mechanism.
                b.Box(V(0, 0.50f, 0), V(0.52f, 0.02f, 0.46f), 0, 0.008f, 0.5f);
                b.Box(V(0, 0.468f, -0.02f), V(0.16f, 0.05f, 0.18f), 0, 0.01f, 0.5f);
                Tube(b, V(0.08f, 0.466f, 0.03f), V(0.25f, 0.455f, 0.13f), 0.007f, 8, 0);
                b.Ellipsoid(V(0.255f, 0.455f, 0.135f), V(0.014f, 0.014f, 0.014f), 10, 6, 2);
                // Seat cushion with a piped seam.
                b.Box(V(0, 0.565f, 0), V(0.56f, 0.11f, 0.50f), 1, 0.04f, 0.4f, null, 3);
                b.Box(V(0, 0.5115f, 0), V(0.572f, 0.004f, 0.512f), 0, 0.001f, 0.5f);

                // Reclining backrest.
                b.Transform = TRS(V(0, 0.62f, -0.235f), Rx(-14f));
                b.Cylinder(V(0, 0.018f, -0.01f), 0.022f, 0.52f, 14, 0, 0.5f, Rz(90f));
                b.Box(V(0, 0.32f, -0.068f), V(0.50f, 0.56f, 0.012f), 0, 0.006f, 0.5f);
                for (int i = -1; i <= 1; i++)
                    b.Box(V(i * 0.172f, 0.32f, 0f), V(0.168f, 0.60f, 0.10f), 1, 0.03f, 0.4f, null, 3);
                b.Box(V(-0.268f, 0.32f, 0f), V(0.016f, 0.60f, 0.112f), 0, 0.005f, 0.5f);
                b.Box(V(0.268f, 0.32f, 0f), V(0.016f, 0.60f, 0.112f), 0, 0.005f, 0.5f);
                // Headrest on a bar.
                Tube(b, V(-0.05f, 0.45f, -0.01f), V(-0.05f, 0.66f, -0.01f), 0.009f, 10, 0);
                Tube(b, V(0.05f, 0.45f, -0.01f), V(0.05f, 0.66f, -0.01f), 0.009f, 10, 0);
                b.Box(V(0, 0.69f, 0.008f), V(0.26f, 0.14f, 0.07f), 1, 0.03f, 0.4f, null, 3);
                b.Box(V(0, 0.69f, -0.038f), V(0.285f, 0.152f, 0.016f), 0, 0.006f, 0.5f);
                b.Transform = Matrix4x4.identity;

                // Armrests (chrome frame + leather pads, pad top at 0.80).
                for (int s = -1; s <= 1; s += 2)
                {
                    float x = s * 0.325f;
                    b.Box(V(s * 0.30f, 0.495f, 0f), V(0.08f, 0.025f, 0.40f), 0, 0.008f, 0.5f);
                    b.Cylinder(V(x, 0.62f, -0.13f), 0.014f, 0.24f, 12, 0, 0.5f);
                    b.Cylinder(V(x, 0.62f, 0.15f), 0.014f, 0.24f, 12, 0, 0.5f);
                    b.Box(V(x, 0.7425f, 0.01f), V(0.04f, 0.025f, 0.36f), 0, 0.008f, 0.5f);
                    b.Box(V(x, 0.7775f, 0.02f), V(0.075f, 0.045f, 0.32f), 1, 0.018f, 0.4f, null, 3);
                }
            });

            var seat = Marker(root.transform, "SeatPoint", V(0, 0.62f, 0.02f));
            seat.localRotation = Quaternion.identity;
            Marker(root.transform, "BarberStandPoint", V(0, 0, -0.75f));
            Col(root, V(0, 0.70f, 0.04f), V(0.74f, 1.40f, 1.0f));
            return root;
        }

        // ================================================================== 2. Waiting chair

        public GameObject WaitingChair(Material seatMaterial)
        {
            var root = Root("WaitingChair");
            Part(root.transform, "Chair", "WaitingChair", M(m.Chrome, seatMaterial, m.PlasticBlack), b =>
            {
                for (int s = -1; s <= 1; s += 2)
                {
                    float x = s * 0.22f;
                    var fFoot = V(x, 0.014f, 0.20f);
                    var fKnee = V(x, 0.42f, 0.20f);
                    var bFoot = V(x, 0.014f, -0.27f);
                    var bKnee = V(x, 0.43f, -0.20f);
                    var bTop = V(x, 0.86f, -0.27f);
                    const float r = 0.011f;
                    Tube(b, fFoot, fKnee, r, 12, 0);
                    Tube(b, bFoot, bKnee, r, 12, 0);
                    Tube(b, bKnee, bTop, r, 12, 0);
                    Tube(b, fKnee, bKnee, r, 12, 0);
                    Tube(b, V(x, 0.16f, 0.20f), V(x, 0.16f, -0.24f), r * 0.85f, 10, 0);
                    b.Ellipsoid(fKnee, V(r, r, r) * 1.05f, 10, 6, 0);
                    b.Ellipsoid(bKnee, V(r, r, r) * 1.05f, 10, 6, 0);
                    b.Ellipsoid(bTop, V(r, r, r) * 1.05f, 10, 6, 0);
                    b.Cylinder(V(x, 0.007f, 0.20f), 0.017f, 0.014f, 12, 2, 0.1f);
                    b.Cylinder(V(x, 0.007f, -0.27f), 0.017f, 0.014f, 12, 2, 0.1f);
                }
                Tube(b, V(-0.22f, 0.40f, 0.18f), V(0.22f, 0.40f, 0.18f), 0.01f, 10, 0);
                Tube(b, V(-0.22f, 0.40f, -0.18f), V(0.22f, 0.40f, -0.18f), 0.01f, 10, 0);
                Tube(b, V(-0.22f, 0.86f, -0.27f), V(0.22f, 0.86f, -0.27f), 0.01f, 10, 0);
                // Seat cushion (top at 0.46) and backrest pad.
                b.Box(V(0, 0.43f, 0.0f), V(0.48f, 0.06f, 0.46f), 1, 0.022f, 0.4f, null, 3);
                b.Transform = TRS(V(0, 0.64f, -0.255f), Rx(-8f));
                b.Box(V(0, 0, 0), V(0.46f, 0.26f, 0.045f), 1, 0.02f, 0.4f, null, 3);
                b.Transform = Matrix4x4.identity;
            });
            Marker(root.transform, "SeatPoint", V(0, 0.46f, 0.05f));
            Col(root, V(0, 0.45f, -0.03f), V(0.52f, 0.90f, 0.56f));
            return root;
        }

        // ================================================================== 3. Workstation

        public GameObject Workstation()
        {
            var root = Root("Workstation");
            Part(root.transform, "Cabinet", "Workstation_Cabinet", M(m.WoodDark, m.Brass, m.Countertop, m.MetalDark), b =>
            {
                b.Box(V(0, 0.035f, -0.01f), V(1.54f, 0.07f, 0.46f), 3, 0.004f, 0.5f);
                b.Box(V(0, 0.465f, 0), V(1.60f, 0.79f, 0.50f), 0, 0.012f, 0.5f);
                float[] xs = { -0.53f, 0f, 0.53f };
                for (int i = 0; i < 3; i++)
                {
                    float x = xs[i];
                    // Drawer: dark reveal, proud front, raised field, brass bar pull.
                    b.Box(V(x, 0.74f, 0.252f), V(0.52f, 0.20f, 0.004f), 3, 0f, 0.5f);
                    b.Box(V(x, 0.74f, 0.258f), V(0.50f, 0.18f, 0.016f), 0, 0.004f, 0.5f);
                    b.Box(V(x, 0.74f, 0.2665f), V(0.40f, 0.12f, 0.004f), 0, 0.0015f, 0.5f);
                    b.Cylinder(V(x, 0.74f, 0.287f), 0.005f, 0.10f, 10, 1, 0.1f, Rz(90f));
                    b.Cylinder(V(x - 0.04f, 0.74f, 0.2765f), 0.004f, 0.02f, 8, 1, 0.1f, Rx(90f));
                    b.Cylinder(V(x + 0.04f, 0.74f, 0.2765f), 0.004f, 0.02f, 8, 1, 0.1f, Rx(90f));
                    // Cupboard door below with raised panel and brass knob.
                    b.Box(V(x, 0.36f, 0.252f), V(0.52f, 0.50f, 0.004f), 3, 0f, 0.5f);
                    b.Box(V(x, 0.36f, 0.258f), V(0.50f, 0.48f, 0.016f), 0, 0.004f, 0.5f);
                    b.Box(V(x, 0.36f, 0.2665f), V(0.38f, 0.36f, 0.005f), 0, 0.003f, 0.5f);
                    b.Cylinder(V(x, 0.53f, 0.2775f), 0.004f, 0.018f, 8, 1, 0.1f, Rx(90f));
                    b.Ellipsoid(V(x, 0.53f, 0.2865f), V(0.011f, 0.011f, 0.009f), 12, 8, 1);
                }
                // Countertop slab, brass edge strip and backsplash.
                b.Box(V(0, 0.88f, 0.03f), V(1.66f, 0.04f, 0.56f), 2, 0.008f, 0.5f);
                b.Box(V(0, 0.872f, 0.3125f), V(1.64f, 0.008f, 0.004f), 1, 0.001f, 0.2f);
                b.Box(V(0, 0.96f, -0.235f), V(1.66f, 0.12f, 0.03f), 2, 0.006f, 0.5f);
                b.Box(V(0, 0.905f, -0.2f), V(1.66f, 0.01f, 0.012f), 1, 0.003f, 0.2f);
            });
            Marker(root.transform, "ToolSurface", V(0, 0.90f, 0.03f));
            Col(root, V(0, 0.45f, 0.03f), V(1.66f, 0.90f, 0.56f));
            return root;
        }

        // ================================================================== 4. Reception counter

        public GameObject ReceptionCounter()
        {
            var root = Root("ReceptionCounter");
            Part(root.transform, "Counter", "ReceptionCounter", M(m.WoodDark, m.Countertop, m.Brass, m.MetalDark), b =>
            {
                b.Box(V(0, 0.02f, 0), V(1.34f, 0.04f, 0.56f), 3, 0.004f, 0.5f);
                b.Box(V(0, 0.47f, 0), V(1.40f, 0.86f, 0.62f), 0, 0.012f, 0.5f);
                // Four inset panels across the customer-facing front.
                for (int i = 0; i < 4; i++)
                {
                    float x = -0.5025f + i * 0.335f;
                    b.Box(V(x, 0.47f, 0.311f), V(0.30f, 0.64f, 0.006f), 3, 0f, 0.5f);
                    b.Box(V(x, 0.47f, 0.317f), V(0.28f, 0.62f, 0.012f), 0, 0.005f, 0.5f);
                    b.Box(V(x, 0.47f, 0.3245f), V(0.20f, 0.52f, 0.006f), 0, 0.003f, 0.5f);
                }
                // Top slab and brass foot rail.
                b.Box(V(0, 0.92f, 0.01f), V(1.46f, 0.04f, 0.66f), 1, 0.008f, 0.5f);
                b.Box(V(0, 0.912f, 0.3425f), V(1.44f, 0.008f, 0.004f), 2, 0.001f, 0.2f);
                // Raised shelf lip on the customer side, held by two brackets.
                b.Box(V(0, 1.035f, 0.22f), V(1.40f, 0.03f, 0.18f), 0, 0.008f, 0.5f);
                b.Box(V(0, 1.0f, 0.305f), V(1.40f, 0.04f, 0.012f), 0, 0.004f, 0.5f);
                for (int s = -1; s <= 1; s += 2)
                    b.Box(V(s * 0.62f, 0.98f, 0.2f), V(0.03f, 0.08f, 0.14f), 0, 0.005f, 0.5f);
                b.Cylinder(V(0, 0.13f, 0.37f), 0.018f, 1.20f, 14, 2, 0.1f, Rz(90f));
                for (int s = -1; s <= 1; s += 2)
                {
                    b.Cylinder(V(s * 0.55f, 0.13f, 0.34f), 0.008f, 0.06f, 8, 2, 0.1f, Rx(90f));
                    b.Cylinder(V(s * 0.6f, 0.13f, 0.37f), 0.022f, 0.01f, 14, 2, 0.1f, Rz(90f));
                }
            });
            Col(root, V(0, 0.525f, 0.02f), V(1.46f, 1.05f, 0.66f));
            return root;
        }

        // ================================================================== 5. Cash register

        public GameObject CashRegister()
        {
            var root = Root("CashRegister");
            Part(root.transform, "Register", "CashRegister", M(m.RegisterBody, m.PlasticWhite, m.PlasticBlack, m.Brass, m.Chrome), b =>
            {
                // Drawer base with seams and pull.
                b.Box(V(0, 0.06f, 0), V(0.40f, 0.12f, 0.38f), 0, 0.012f, 0.3f);
                b.Box(V(0, 0.045f, 0.1905f), V(0.37f, 0.004f, 0.004f), 2, 0f, 0.2f);
                b.Box(V(-0.1905f, 0.045f, 0f), V(0.004f, 0.004f, 0.35f), 2, 0f, 0.2f);
                b.Box(V(0.1905f, 0.045f, 0f), V(0.004f, 0.004f, 0.35f), 2, 0f, 0.2f);
                b.Box(V(0, 0.06f, 0.1925f), V(0.34f, 0.066f, 0.006f), 0, 0.002f, 0.3f);
                b.Box(V(0, 0.06f, 0.199f), V(0.08f, 0.012f, 0.008f), 4, 0.003f, 0.2f);
                b.Box(V(0, 0.122f, 0.0f), V(0.405f, 0.006f, 0.385f), 3, 0.002f, 0.2f);
                // Rear housing and display flag.
                b.Box(V(0, 0.20f, -0.12f), V(0.38f, 0.16f, 0.14f), 0, 0.014f, 0.3f);
                b.Box(V(0, 0.31f, -0.12f), V(0.24f, 0.10f, 0.05f), 0, 0.01f, 0.3f);
                b.Box(V(0, 0.313f, -0.0925f), V(0.20f, 0.055f, 0.005f), 1, 0.002f, 0.2f);
                for (int i = 0; i < 4; i++)
                    b.Box(V(-0.066f + i * 0.044f, 0.313f, -0.0895f), V(0.028f, 0.038f, 0.003f), 2, 0.001f, 0.2f);
                // Underbody wedge fills the gap beneath the sloped deck.
                b.Box(V(0, 0.15f, 0.05f), V(0.37f, 0.06f, 0.22f), 0, 0.008f, 0.3f);
                // Sloped key deck.
                b.Transform = TRS(V(0, 0.20f, 0.07f), Rx(22f));
                b.Box(V(0, -0.0125f, 0), V(0.38f, 0.05f, 0.27f), 0, 0.008f, 0.3f);
                for (int c = 0; c < 5; c++)
                {
                    for (int r = 0; r < 4; r++)
                    {
                        float x = -0.14f + c * 0.062f;
                        float z = -0.095f + r * 0.058f;
                        int sub = c < 4 ? 1 : 2;
                        b.Cylinder(V(x, 0.0095f, z), 0.0165f, 0.015f, 12, sub, 0.1f);
                        b.Cylinder(V(x, 0.0035f, z), 0.0195f, 0.004f, 12, 4, 0.1f);
                    }
                }
                b.Box(V(0.155f, 0.012f, 0f), V(0.04f, 0.012f, 0.0f + 0.04f), 3, 0.003f, 0.2f);
                b.Transform = Matrix4x4.identity;
                // Brass crank on the right side.
                b.Cylinder(V(0.205f, 0.20f, -0.12f), 0.007f, 0.03f, 10, 3, 0.1f, Rz(90f));
                Tube(b, V(0.222f, 0.20f, -0.12f), V(0.222f, 0.145f, -0.075f), 0.0045f, 8, 3);
                b.Ellipsoid(V(0.222f, 0.14f, -0.07f), V(0.012f, 0.012f, 0.012f), 12, 8, 3);
                // Feet.
                for (int i = 0; i < 4; i++)
                    b.Cylinder(V(i < 2 ? -0.17f : 0.17f, 0.004f, i % 2 == 0 ? 0.16f : -0.16f), 0.016f, 0.008f, 10, 2, 0.1f);
            });
            return root;
        }

        // ================================================================== 6. Clipper

        public GameObject Clipper()
        {
            var root = Root("Clipper");
            Part(root.transform, "Mesh", "Clipper", M(m.PlasticBlack, m.Chrome, m.MetalDark, m.PlasticWhite), b =>
            {
                b.Box(V(0, 0.020f, -0.0225f), V(0.062f, 0.040f, 0.115f), 0, 0.015f, 0.2f, null, 3);
                b.Box(V(0, 0.0215f, 0.0425f), V(0.056f, 0.029f, 0.036f), 0, 0.008f, 0.2f);
                // Blade set: fixed plate, cutter guard, moving blade and teeth.
                b.Box(V(0, 0.00175f, 0.066f), V(0.044f, 0.0035f, 0.030f), 1, 0.0005f, 0.1f);
                b.Box(V(0, 0.0065f, 0.0535f), V(0.044f, 0.004f, 0.006f), 2, 0.0005f, 0.1f);
                b.Box(V(0, 0.0052f, 0.0665f), V(0.040f, 0.003f, 0.026f), 1, 0.0004f, 0.1f);
                for (int i = 0; i < 16; i++)
                {
                    float x = -0.0195f + i * 0.0026f;
                    b.Box(V(x, 0.00175f, 0.0775f), V(0.0016f, 0.0035f, 0.007f), 1, 0f, 0.1f);
                }
                for (int i = 0; i < 15; i++)
                {
                    float x = -0.0182f + i * 0.0026f;
                    b.Box(V(x, 0.0052f, 0.0785f), V(0.0016f, 0.003f, 0.006f), 1, 0f, 0.1f);
                }
                // Top screws, blade lever and slide switch in its slot.
                b.Cylinder(V(-0.014f, 0.0362f, 0.045f), 0.003f, 0.0016f, 10, 1, 0.1f);
                b.Cylinder(V(0.014f, 0.0362f, 0.045f), 0.003f, 0.0016f, 10, 1, 0.1f);
                b.Box(V(0, 0.0375f, 0.031f), V(0.018f, 0.003f, 0.010f), 1, 0.001f, 0.1f);
                b.Box(V(0, 0.0401f, -0.035f), V(0.018f, 0.0008f, 0.034f), 2, 0f, 0.1f);
                b.Box(V(0, 0.0428f, -0.032f), V(0.012f, 0.005f, 0.018f), 3, 0.0015f, 0.1f);
                // Side badges and rear cord.
                b.Box(V(-0.0316f, 0.025f, 0.004f), V(0.0012f, 0.012f, 0.022f), 3, 0f, 0.1f);
                b.Box(V(0.0316f, 0.025f, 0.004f), V(0.0012f, 0.012f, 0.022f), 3, 0f, 0.1f);
                for (int i = 0; i < 5; i++)
                {
                    b.Box(V(-0.0313f, 0.016f, -0.07f + i * 0.007f), V(0.0008f, 0.02f, 0.0025f), 2, 0f, 0.1f);
                    b.Box(V(0.0313f, 0.016f, -0.07f + i * 0.007f), V(0.0008f, 0.02f, 0.0025f), 2, 0f, 0.1f);
                }
                b.Cylinder(V(0, 0.02f, -0.0925f), 0.005f, 0.025f, 10, 0, 0.1f, Rx(90f));
            });
            return root;
        }

        // ================================================================== 7. Scissors

        private static void Blade(MeshBuilder b, Vector3 from, Vector3 to, float baseWidth, float t)
        {
            float[] cuts = { 0f, 0.4f, 0.75f, 1f };
            float[] widths = { 1f, 0.78f, 0.5f };
            for (int i = 0; i < 3; i++)
                Bar(b, Vector3.Lerp(from, to, cuts[i]), Vector3.Lerp(from, to, cuts[i + 1]), baseWidth * widths[i], t, 0, 0.0004f);
        }

        public GameObject Scissors()
        {
            var root = Root("Scissors");
            Part(root.transform, "Mesh", "Scissors", M(m.Chrome, m.MetalDark), b =>
            {
                float yA = 0.0035f, yB = 0.0075f, t = 0.003f;
                // Blade A runs to the left tip, its handle to the right ring; B mirrors it.
                Blade(b, V(0, yA, 0.004f), V(-0.016f, yA, 0.088f), 0.0105f, t);
                Blade(b, V(0, yB, 0.004f), V(0.016f, yB, 0.088f), 0.0105f, t);
                Bar(b, V(0, yA, 0.004f), V(0.0215f, yA, -0.047f), 0.007f, t, 0, 0.0004f);
                Bar(b, V(0, yB, 0.004f), V(-0.0215f, yB, -0.047f), 0.007f, t, 0, 0.0004f);
                b.Torus(V(0.0235f, yA, -0.0615f), 0.0145f, 0.0032f, 24, 8, 0);
                b.Torus(V(-0.0235f, yB, -0.0615f), 0.0145f, 0.0032f, 24, 8, 0);
                // Finger rest tang.
                Bar(b, V(-0.0225f, yB, -0.0755f), V(-0.0225f, yB, -0.0865f), 0.006f, t, 0, 0.0004f);
                // Pivot hubs and screw.
                b.Cylinder(V(0, yA, 0.001f), 0.0075f, t, 14, 0, 0.1f);
                b.Cylinder(V(0, yB, 0.001f), 0.0075f, t, 14, 0, 0.1f);
                b.Cylinder(V(0, 0.0055f, 0.001f), 0.0045f, 0.0115f, 12, 1, 0.1f);
            });
            return root;
        }

        // ================================================================== 8. Comb

        public GameObject Comb()
        {
            var root = Root("Comb");
            Part(root.transform, "Mesh", "Comb", M(m.PlasticBlack), b =>
            {
                b.Box(V(0, 0.0025f, -0.011f), V(0.18f, 0.005f, 0.012f), 0, 0.0015f, 0.1f);
                for (int i = 0; i < 22; i++)
                {
                    float x = -0.0868f + i * 0.00827f;
                    bool coarse = i < 8;
                    float len = coarse ? 0.024f : 0.021f;
                    float wd = coarse ? 0.0028f : 0.0018f;
                    b.Box(V(x, 0.00175f, -0.005f + len * 0.5f), V(wd, 0.0035f, len), 0, 0f, 0.1f);
                }
                b.Box(V(-0.0895f, 0.0025f, 0.002f), V(0.003f, 0.005f, 0.034f), 0, 0.001f, 0.1f);
                b.Box(V(0.0895f, 0.0025f, 0.002f), V(0.003f, 0.005f, 0.034f), 0, 0.001f, 0.1f);
            });
            return root;
        }

        // ================================================================== 9. Spray bottle

        public GameObject SprayBottle()
        {
            var root = Root("SprayBottle");
            Part(root.transform, "Mesh", "SprayBottle", M(m.PlasticAmber, m.PlasticBlack, m.PlasticWhite), b =>
            {
                b.Lathe(V(0, 0, 0), Pr(0f, 0f, 0.026f, 0f, 0.031f, 0.006f, 0.0335f, 0.02f, 0.0335f, 0.115f, 0.030f, 0.13f,
                    0.019f, 0.145f, 0.0155f, 0.152f, 0.0155f, 0.158f), 20, 0, true, false, 0.2f);
                b.Lathe(V(0, 0, 0), Pr(0.0342f, 0.04f, 0.0342f, 0.10f), 20, 2, false, false, 0.2f);
                // Collar, head, nozzle and trigger.
                b.Lathe(V(0, 0, 0), Pr(0.0185f, 0.150f, 0.0185f, 0.170f, 0.016f, 0.172f), 16, 1, true, true, 0.2f);
                for (int i = 0; i < 3; i++)
                    b.Torus(V(0, 0.154f + i * 0.007f, 0), 0.0185f, 0.0012f, 16, 4, 1);
                b.Box(V(0, 0.188f, 0.008f), V(0.026f, 0.036f, 0.060f), 1, 0.010f, 0.2f);
                b.Cylinder(V(0, 0.19f, 0.048f), 0.0085f, 0.022f, 12, 1, 0.1f, Rx(90f));
                b.Cylinder(V(0, 0.19f, 0.060f), 0.0045f, 0.006f, 10, 1, 0.1f, Rx(90f));
                b.Transform = TRS(V(0, 0.163f, 0.032f), Rx(-18f));
                b.Box(V(0, 0, 0), V(0.012f, 0.044f, 0.008f), 1, 0.003f, 0.1f);
                b.Transform = Matrix4x4.identity;
            });
            return root;
        }

        // ================================================================== 10. Towel stack

        public GameObject TowelStack(int count)
        {
            count = Mathf.Max(1, count);
            var root = Root("TowelStack");
            Part(root.transform, "Towels", "TowelStack_" + count, M(m.Fabric, m.FabricCream), b =>
            {
                for (int i = 0; i < count; i++)
                {
                    float yaw = (Hash(i, 3f, 1f) - 0.5f) * 10f;
                    float ox = (Hash(i, 5f, 2f) - 0.5f) * 0.02f;
                    float oz = (Hash(i, 7f, 3f) - 0.5f) * 0.02f;
                    b.Transform = TRS(V(ox, 0.035f + i * 0.066f, oz), Ry(yaw));
                    b.Box(V(0, 0, 0), V(0.32f, 0.07f, 0.22f), 0, 0.022f, 0.3f, null, 3);
                    b.Box(V(-0.10f, 0, 0), V(0.012f, 0.0715f, 0.2215f), 1, 0.005f, 0.3f);
                    b.Box(V(-0.07f, 0, 0), V(0.006f, 0.0712f, 0.2212f), 1, 0.003f, 0.3f);
                }
                b.Transform = Matrix4x4.identity;
            });
            return root;
        }

        // ================================================================== 11. Cardboard box

        public GameObject CardboardBox(Vector3 size, bool open)
        {
            var root = Root("CardboardBox");
            string name = string.Format("CardboardBox_{0:0.00}x{1:0.00}x{2:0.00}_{3}", size.x, size.y, size.z, open ? "open" : "closed");
            Part(root.transform, "Mesh", name, M(m.Cardboard, m.Paper), b =>
            {
                float w = size.x, h = size.y, d = size.z, t = 0.006f;
                if (!open)
                {
                    b.Box(V(0, h * 0.5f, 0), size, 0, Mathf.Min(0.012f, h * 0.2f), 0.5f);
                    b.Box(V(0, h + 0.0005f, 0), V(0.05f, 0.002f, d + 0.004f), 1, 0.0005f, 0.2f);
                    b.Box(V(0, h * 0.5f, d * 0.5f + 0.0005f), V(0.05f, h * 0.35f, 0.002f), 1, 0.0005f, 0.2f);
                    b.Box(V(0, h * 0.5f, d * 0.5f + 0.0008f), V(w * 0.6f, 0.002f, 0.002f), 1, 0f, 0.2f);
                    return;
                }
                b.Box(V(0, t * 0.5f, 0), V(w, t, d), 0, 0.003f, 0.5f);
                b.Box(V(0, h * 0.5f, d * 0.5f - t * 0.5f), V(w, h, t), 0, 0.003f, 0.5f);
                b.Box(V(0, h * 0.5f, -d * 0.5f + t * 0.5f), V(w, h, t), 0, 0.003f, 0.5f);
                b.Box(V(-w * 0.5f + t * 0.5f, h * 0.5f, 0), V(t, h, d), 0, 0.003f, 0.5f);
                b.Box(V(w * 0.5f - t * 0.5f, h * 0.5f, 0), V(t, h, d), 0, 0.003f, 0.5f);
                // Four flaps angled outwards (about 40 degrees above horizontal).
                float ang = 40f * Mathf.Deg2Rad;
                Flap(b, V(0, h, d * 0.5f), V(0, Mathf.Sin(ang), Mathf.Cos(ang)), w, d * 0.5f);
                Flap(b, V(0, h, -d * 0.5f), V(0, Mathf.Sin(ang), -Mathf.Cos(ang)), w, d * 0.5f);
                Flap(b, V(w * 0.5f, h, 0), V(Mathf.Cos(ang), Mathf.Sin(ang), 0), d, w * 0.5f);
                Flap(b, V(-w * 0.5f, h, 0), V(-Mathf.Cos(ang), Mathf.Sin(ang), 0), d, w * 0.5f);
            });
            return root;
        }

        private static void Flap(MeshBuilder b, Vector3 hinge, Vector3 dir, float edge, float length)
        {
            dir = dir.normalized;
            b.Box(hinge + dir * (length * 0.5f), V(edge, 0.004f, length), 0, 0.0015f, 0.5f, Quaternion.LookRotation(dir, Vector3.up), 1);
        }

        // ================================================================== 12. Broom

        public GameObject Broom()
        {
            var root = Root("Broom");
            Part(root.transform, "Mesh", "Broom", M(m.WoodDark, m.Soil, m.MetalDark), b =>
            {
                b.Cylinder(V(0, 0.80f, 0), 0.012f, 1.30f, 12, 0, 0.3f);
                b.Ellipsoid(V(0, 1.45f, 0), V(0.0135f, 0.012f, 0.0135f), 10, 6, 0);
                // Head block and ferrule.
                b.Box(V(0, 0.19f, 0), V(0.30f, 0.045f, 0.05f), 0, 0.012f, 0.3f);
                b.Frustum(V(0, 0.22f, 0), 0.022f, 0.014f, 0.05f, 12, 2, 0.1f);
                // Bristles: a dense block plus splayed outer tufts.
                b.Box(V(0, 0.115f, 0), V(0.28f, 0.14f, 0.04f), 1, 0.012f, 0.1f);
                for (int i = 0; i < 9; i++)
                {
                    float x = -0.125f + i * 0.03125f;
                    float splay = (i - 4) * 3.5f;
                    b.Box(V(x, 0.045f, 0), V(0.032f, 0.09f, 0.038f), 1, 0.004f, 0.1f, Rz(splay), 1);
                }
                // Binding wire.
                b.Box(V(0, 0.16f, 0), V(0.29f, 0.012f, 0.044f), 2, 0.004f, 0.1f);
            });
            return root;
        }

        // ================================================================== 13. Shelf unit

        public GameObject WallShelf(float width, int shelves)
        {
            shelves = Mathf.Max(1, shelves);
            var root = Root("ShelfUnit");
            const float h = 1.8f, d = 0.38f;
            var tops = new float[shelves];
            for (int i = 0; i < shelves; i++)
                tops[i] = shelves == 1 ? 0.9f : 0.25f + i * (1.45f / (shelves - 1));
            Part(root.transform, "Frame", string.Format("ShelfUnit_{0:0.00}_{1}", width, shelves), M(m.MetalDark, m.WoodDark, m.PlasticBlack), b =>
            {
                float hx = width * 0.5f - 0.02f, hz = d * 0.5f - 0.02f;
                for (int sx = -1; sx <= 1; sx += 2)
                {
                    for (int sz = -1; sz <= 1; sz += 2)
                    {
                        b.Box(V(sx * hx, h * 0.5f + 0.01f, sz * hz), V(0.04f, h - 0.02f, 0.04f), 0, 0.006f, 0.3f);
                        b.Box(V(sx * hx, 0.005f, sz * hz), V(0.05f, 0.01f, 0.05f), 2, 0.003f, 0.1f);
                    }
                }
                // Side stretchers and back cross-bracing.
                for (int sx = -1; sx <= 1; sx += 2)
                {
                    b.Box(V(sx * hx, 0.12f, 0), V(0.025f, 0.03f, d - 0.06f), 0, 0.004f, 0.3f);
                    b.Box(V(sx * hx, h - 0.1f, 0), V(0.025f, 0.03f, d - 0.06f), 0, 0.004f, 0.3f);
                }
                b.Box(V(0, h - 0.1f, -hz), V(width - 0.06f, 0.03f, 0.02f), 0, 0.004f, 0.3f);
                b.Box(V(0, 0.12f, -hz), V(width - 0.06f, 0.03f, 0.02f), 0, 0.004f, 0.3f);
                var a = V(-hx + 0.03f, 0.15f, -hz);
                var c = V(hx - 0.03f, h - 0.13f, -hz);
                Bar(b, a, c, 0.018f, 0.012f, 0, 0.002f, Vector3.forward);
                Bar(b, V(hx - 0.03f, 0.15f, -hz), V(-hx + 0.03f, h - 0.13f, -hz), 0.018f, 0.012f, 0, 0.002f, Vector3.forward);
                // Boards with a front lip.
                for (int i = 0; i < shelves; i++)
                {
                    b.Box(V(0, tops[i] - 0.015f, 0), V(width, 0.03f, d), 1, 0.006f, 0.5f);
                    b.Box(V(0, tops[i] - 0.034f, d * 0.5f - 0.02f), V(width - 0.06f, 0.012f, 0.018f), 0, 0.002f, 0.3f);
                }
            });
            for (int i = 0; i < shelves; i++) Marker(root.transform, "Shelf_" + i, V(0, tops[i], 0));
            Col(root, V(0, h * 0.5f, 0), V(width, h, d));
            return root;
        }

        // ================================================================== 14. Product bottles

        public GameObject ProductBottles(int seed)
        {
            var root = Root("ProductBottles");
            Part(root.transform, "Products", "ProductBottles_" + seed,
                M(m.PlasticAmber, m.BottleGreen, m.PlasticWhite, m.Ceramic, m.Brass, m.PlasticBlack), b =>
            {
                var rnd = new System.Random(seed);
                int n = 5 + rnd.Next(3);
                float step = 0.36f / (n - 1);
                for (int i = 0; i < n; i++)
                {
                    float cx = -0.18f + i * step + ((float)rnd.NextDouble() - 0.5f) * 0.01f;
                    float cz = (i % 2 == 0 ? -0.035f : 0.035f) + ((float)rnd.NextDouble() - 0.5f) * 0.02f;
                    int kind = rnd.Next(3);
                    var c = V(cx, 0, cz);
                    if (kind == 1)
                    {
                        // Squat pomade jar with brass lid.
                        float r = 0.034f + (float)rnd.NextDouble() * 0.004f, h = 0.05f + (float)rnd.NextDouble() * 0.015f;
                        int[] choices = { 3, 2, 0, 5 };
                        int bm = choices[rnd.Next(choices.Length)];
                        b.Lathe(c, Pr(0f, 0f, r - 0.004f, 0f, r, 0.004f, r, h * 0.92f, r - 0.002f, h), 24, bm, true, false, 0.2f);
                        b.Lathe(c, Pr(r - 0.001f, h, r + 0.0015f, h + 0.002f, r + 0.0015f, h + 0.017f, r - 0.003f, h + 0.02f), 24, 4, false, true, 0.2f);
                        b.Lathe(c, Pr(r + 0.0006f, h * 0.2f, r + 0.0006f, h * 0.75f), 24, bm == 2 ? 5 : 2, false, false, 0.2f);
                    }
                    else
                    {
                        float H = kind == 0 ? 0.17f + (float)rnd.NextDouble() * 0.04f : 0.12f + (float)rnd.NextDouble() * 0.03f;
                        float r = kind == 0 ? 0.023f : 0.029f;
                        int[] choices = { 0, 1, 2, 3, 1 };
                        int bm = choices[rnd.Next(choices.Length)];
                        float rn = 0.011f;
                        b.Lathe(c, Pr(0f, 0f, r - 0.005f, 0f, r, 0.005f, r, H * 0.55f, r * 0.9f, H * 0.68f, rn * 1.5f, H * 0.80f,
                            rn, H * 0.86f, rn, H - 0.02f), 20, bm, true, false, 0.2f);
                        int capMat = rnd.Next(2) == 0 ? 4 : 5;
                        b.Lathe(c, Pr(0.0125f, H - 0.03f, 0.0125f, H - 0.004f, 0.011f, H), 16, capMat, true, true, 0.2f);
                        if (bm != 2 && bm != 3)
                            b.Lathe(c, Pr(r + 0.0006f, H * 0.18f, r + 0.0006f, H * 0.5f), 20, 2, false, false, 0.2f);
                    }
                }
            });
            return root;
        }

        // ================================================================== 15/16. Magazine table + magazine

        public GameObject MagazineTable()
        {
            var root = Root("MagazineTable");
            Part(root.transform, "Table", "MagazineTable", M(m.WoodDark, m.Brass), b =>
            {
                b.Box(V(0, 0.405f, 0), V(0.62f, 0.03f, 0.42f), 0, 0.008f, 0.5f);
                // Apron rails and lower magazine shelf.
                b.Box(V(0, 0.365f, 0.175f), V(0.50f, 0.05f, 0.015f), 0, 0.003f, 0.5f);
                b.Box(V(0, 0.365f, -0.175f), V(0.50f, 0.05f, 0.015f), 0, 0.003f, 0.5f);
                b.Box(V(0.265f, 0.365f, 0f), V(0.015f, 0.05f, 0.34f), 0, 0.003f, 0.5f);
                b.Box(V(-0.265f, 0.365f, 0f), V(0.015f, 0.05f, 0.34f), 0, 0.003f, 0.5f);
                b.Box(V(0, 0.13f, 0), V(0.50f, 0.014f, 0.32f), 0, 0.004f, 0.5f);
                for (int sx = -1; sx <= 1; sx += 2)
                {
                    for (int sz = -1; sz <= 1; sz += 2)
                    {
                        var top = V(sx * 0.255f, 0.39f, sz * 0.165f);
                        var bot = V(sx * 0.285f, 0.012f, sz * 0.185f);
                        var dir = (top - bot).normalized;
                        float len = (top - bot).magnitude;
                        b.Frustum((top + bot) * 0.5f, 0.0125f, 0.022f, len, 14, 0, 0.3f, Quaternion.FromToRotation(Vector3.up, dir));
                        b.Cylinder(V(bot.x, 0.006f, bot.z), 0.0135f, 0.012f, 14, 1, 0.1f);
                    }
                }
            });
            var m0 = Magazine(0); m0.transform.SetParent(root.transform, false);
            m0.transform.localPosition = V(-0.10f, 0.42f, 0.02f); m0.transform.localRotation = Ry(12f);
            var m1 = Magazine(1); m1.transform.SetParent(root.transform, false);
            m1.transform.localPosition = V(0.06f, 0.4262f, -0.03f); m1.transform.localRotation = Ry(-24f);
            var m2 = Magazine(3); m2.transform.SetParent(root.transform, false);
            m2.transform.localPosition = V(0.14f, 0.432f, 0.07f); m2.transform.localRotation = Ry(35f);
            Col(root, V(0, 0.21f, 0), V(0.62f, 0.42f, 0.42f));
            return root;
        }

        public GameObject Magazine(int coverIndex)
        {
            coverIndex = Mathf.Clamp(coverIndex, 0, 3);
            var root = Root("Magazine_" + coverIndex);
            Part(root.transform, "Mesh", "Magazine_" + coverIndex, M(m.Paper, m.Magazines), b =>
            {
                b.Box(V(0, 0.003f, 0), V(0.21f, 0.006f, 0.28f), 0, 0.0015f, 0.3f, null, 1);
                // Slightly smaller sheet block so the cover edge reads.
                b.Box(V(0.003f, 0.003f, 0), V(0.205f, 0.0045f, 0.276f), 0, 0f, 0.3f);
                int col = coverIndex % 2, row = coverIndex / 2;
                var rect = new Rect(col * 0.5f, 0.5f - row * 0.5f, 0.5f, 0.5f);
                b.Quad(V(0, 0.0063f, 0), new Vector2(0.21f, 0.28f), 1, Rx(-90f), rect, false);
            });
            return root;
        }

        // ================================================================== 17. Coat rack

        public GameObject CoatRack()
        {
            var root = Root("CoatRack");
            Part(root.transform, "Rack", "CoatRack", M(m.WoodDark, m.Brass), b =>
            {
                b.Lathe(V(0, 0, 0), Pr(0.05f, 0f, 0.06f, 0.01f, 0.055f, 0.045f, 0.032f, 0.09f, 0.022f, 0.13f, 0.02f, 0.2f,
                    0.018f, 1.5f, 0.021f, 1.55f, 0.026f, 1.6f, 0.021f, 1.65f, 0.019f, 1.7f), 20, 0, true, true, 0.5f);
                b.Ellipsoid(V(0, 1.72f, 0), V(0.033f, 0.033f, 0.033f), 16, 10, 0, 0.5f);
                for (int k = 0; k < 4; k++)
                {
                    b.Transform = Matrix4x4.Rotate(Ry(k * 90f));
                    b.Box(V(0.15f, 0.02f, 0), V(0.30f, 0.04f, 0.052f), 0, 0.016f, 0.5f);
                    b.Cylinder(V(0.285f, 0.043f, 0), 0.013f, 0.008f, 12, 1, 0.1f);
                    b.Transform = Matrix4x4.identity;
                }
                for (int k = 0; k < 8; k++)
                {
                    float y = k % 2 == 0 ? 1.60f : 1.52f;
                    b.Transform = Matrix4x4.Rotate(Ry(k * 45f));
                    b.Cylinder(V(0.022f, y, 0), 0.016f, 0.012f, 12, 1, 0.1f, Rz(90f));
                    b.Cylinder(V(0.06f, y, 0), 0.006f, 0.08f, 8, 1, 0.1f, Rz(90f));
                    b.Cylinder(V(0.10f, y + 0.02f, 0), 0.006f, 0.05f, 8, 1, 0.1f);
                    b.Ellipsoid(V(0.10f, y + 0.048f, 0), V(0.0105f, 0.0105f, 0.0105f), 10, 6, 1);
                    b.Transform = Matrix4x4.identity;
                }
            });
            Col(root, V(0, 0.875f, 0), V(0.36f, 1.75f, 0.36f));
            return root;
        }

        // ================================================================== 18. Plant

        public GameObject Plant()
        {
            var root = Root("Plant");
            Part(root.transform, "Plant", "Plant", M(m.Terracotta, m.Soil, m.Leaf), b =>
            {
                b.Lathe(V(0, 0, 0), Pr(0.07f, 0f, 0.088f, 0.006f, 0.105f, 0.15f, 0.118f, 0.275f, 0.121f, 0.28f, 0.145f, 0.28f,
                    0.148f, 0.30f, 0.145f, 0.32f, 0.128f, 0.32f, 0.125f, 0.30f, 0.113f, 0.29f, 0.113f, 0.27f), 28, 0, true, true, 0.3f);
                b.Cylinder(V(0, 0.277f, 0), 0.114f, 0.012f, 24, 1, 0.2f);
                var rnd = new System.Random(11);
                for (int i = 0; i < 11; i++)
                {
                    float yaw = (i / 11f) * 360f + (float)rnd.NextDouble() * 20f;
                    float lean = 12f + (float)rnd.NextDouble() * 40f;
                    float stemLen = 0.12f + (float)rnd.NextDouble() * 0.12f;
                    var outDir = V(Mathf.Cos(yaw * Mathf.Deg2Rad), 0f, Mathf.Sin(yaw * Mathf.Deg2Rad));
                    var stemDir = (Vector3.up * Mathf.Cos(lean * Mathf.Deg2Rad) + outDir * Mathf.Sin(lean * Mathf.Deg2Rad)).normalized;
                    var start = V(outDir.x * 0.02f, 0.28f, outDir.z * 0.02f);
                    var end = start + stemDir * stemLen;
                    bool wilted = i % 4 == 1;
                    float droop = wilted ? 60f + (float)rnd.NextDouble() * 20f : 15f + (float)rnd.NextDouble() * 45f;
                    var leafDir = (outDir * Mathf.Cos(droop * Mathf.Deg2Rad) - Vector3.up * Mathf.Sin(droop * Mathf.Deg2Rad)).normalized;
                    float len = 0.07f + (float)rnd.NextDouble() * 0.035f;
                    Tube(b, start, end, 0.0035f, 6, 2, false);
                    float roll = ((float)rnd.NextDouble() - 0.5f) * 40f;
                    b.Ellipsoid(end + leafDir * len * 0.85f, V(0.03f, 0.0045f, len), 10, 6, 2, 0.3f,
                        Quaternion.LookRotation(leafDir, Vector3.up) * Rz(roll));
                }
            });
            return root;
        }

        // ================================================================== 19. Ceiling fan

        public GameObject CeilingFan()
        {
            var root = Root("CeilingFan");
            Part(root.transform, "Mount", "CeilingFan_Mount", M(m.MetalDark, m.Brass), b =>
            {
                b.Lathe(V(0, 0, 0), Pr(0.085f, -0.056f, 0.082f, -0.040f, 0.062f, -0.016f, 0.045f, 0f), 24, 0, true, true, 0.3f);
                b.Torus(V(0, -0.054f, 0), 0.085f, 0.004f, 24, 6, 1);
                b.Cylinder(V(0, -0.225f, 0), 0.012f, 0.35f, 12, 0, 0.3f);
                b.Ellipsoid(V(0, -0.40f, 0), V(0.022f, 0.016f, 0.022f), 12, 6, 0);
                // Motor housing and light fitting.
                b.Lathe(V(0, 0, 0), Pr(0.07f, -0.465f, 0.105f, -0.45f, 0.115f, -0.43f, 0.105f, -0.41f, 0.06f, -0.40f), 28, 0, true, true, 0.3f);
                b.Torus(V(0, -0.43f, 0), 0.1155f, 0.004f, 28, 6, 1);
                b.Lathe(V(0, 0, 0), Pr(0.0f, -0.575f, 0.03f, -0.565f, 0.06f, -0.55f, 0.075f, -0.52f, 0.07f, -0.495f), 24, 0, false, false, 0.3f);
                b.Ellipsoid(V(0, -0.575f, 0), V(0.02f, 0.012f, 0.02f), 10, 6, 1);
            });
            var rotor = new GameObject("Rotor");
            rotor.transform.SetParent(root.transform, false);
            rotor.transform.localPosition = V(0, -0.48f, 0);
            Part(rotor.transform, "Blades", "CeilingFan_Blades", M(m.WoodDark, m.Brass, m.MetalDark), b =>
            {
                b.Cylinder(V(0, 0, 0), 0.14f, 0.024f, 28, 2, 0.3f);
                b.Torus(V(0, 0, 0), 0.14f, 0.005f, 28, 6, 1);
                for (int i = 0; i < 4; i++)
                {
                    b.Transform = Matrix4x4.Rotate(Ry(i * 90f));
                    // Iron arm, brass bracket, pitched blade with two screws.
                    b.Box(V(0.17f, -0.002f, 0), V(0.10f, 0.004f, 0.045f), 2, 0.001f, 0.1f);
                    b.Box(V(0.215f, 0.0f, 0), V(0.03f, 0.006f, 0.052f), 1, 0.002f, 0.1f);
                    b.Box(V(0.48f, -0.014f, 0), V(0.56f, 0.014f, 0.12f), 0, 0.005f, 0.4f, Rx(9f), 2);
                    b.Cylinder(V(0.23f, 0.004f, 0.016f), 0.005f, 0.004f, 10, 1, 0.1f);
                    b.Cylinder(V(0.23f, 0.004f, -0.016f), 0.005f, 0.004f, 10, 1, 0.1f);
                    b.Transform = Matrix4x4.identity;
                }
            });
            return root;
        }

        // ================================================================== 20. Pendant lamp

        public GameObject PendantLamp(float cordLength)
        {
            var root = Root("PendantLamp");
            Part(root.transform, "Cord", string.Format("PendantLamp_Cord_{0:0.00}", cordLength),
                M(m.MetalDark, m.PlasticBlack), b =>
            {
                b.Cylinder(V(0, -0.015f, 0), 0.04f, 0.03f, 20, 0, 0.3f);
                b.Frustum(V(0, -0.035f, 0), 0.04f, 0.015f, 0.01f, 16, 0, 0.3f);
                b.Cylinder(V(0, -(cordLength + 0.03f) * 0.5f - 0.0f, 0), 0.004f, cordLength - 0.03f, 8, 1, 0.1f);
                b.Cylinder(V(0, -cordLength + 0.02f, 0), 0.016f, 0.04f, 12, 0, 0.1f);
            });
            Part(root.transform, "Shade", "PendantLamp_Shade", M(m.MetalDark, m.PlasticWhite), b =>
            {
                // Outer enamel dome (bottom -> top) and white inner reflector (top -> bottom).
                b.Lathe(V(0, 0, 0), Pr(0.16f, -0.13f, 0.1625f, -0.128f, 0.1625f, -0.124f, 0.15f, -0.09f, 0.11f, -0.04f, 0.06f, -0.012f, 0.025f, 0f, 0.02f, 0.012f), 32, 0, false, false, 0.3f);
                b.Lathe(V(0, 0, 0), Pr(0.02f, -0.005f, 0.05f, -0.016f, 0.10f, -0.044f, 0.146f, -0.088f, 0.158f, -0.124f), 32, 1, false, false, 0.3f);
                b.Lathe(V(0, 0, 0), Pr(0.158f, -0.124f, 0.1625f, -0.124f), 32, 0, false, false, 0.3f);
                b.Torus(V(0, -0.13f, 0), 0.1605f, 0.003f, 32, 6, 0);
            }, V(0, -cordLength, 0));
            var bulb = Part(root.transform, "Bulb", "PendantLamp_Bulb", M(m.BulbWarm), b =>
            {
                b.Ellipsoid(V(0, 0, 0), V(0.034f, 0.045f, 0.034f), 16, 10, 0, 0.2f);
            }, V(0, -cordLength - 0.10f, 0));
            return root;
        }

        // ================================================================== 21. Wall clock

        public GameObject WallClock()
        {
            var root = Root("WallClock");
            Part(root.transform, "Clock", "WallClock", M(m.MetalDark, m.ClockFace, m.PlasticBlack, m.Glass), b =>
            {
                b.Transform = Matrix4x4.Rotate(Rx(90f));
                b.Lathe(V(0, 0, 0), Pr(0.19f, 0f, 0.192f, 0.015f, 0.19f, 0.03f, 0.18f, 0.037f, 0.165f, 0.032f, 0.163f, 0.02f), 40, 0, false, false, 0.5f);
                b.Cylinder(V(0, 0.006f, 0), 0.19f, 0.012f, 40, 0, 0.5f);
                b.Cylinder(V(0, 0.014f, 0), 0.164f, 0.004f, 40, 1, 0.33f);
                b.Cylinder(V(0, 0.033f, 0), 0.164f, 0.002f, 40, 3, 0.33f);
                b.Transform = Matrix4x4.identity;
                for (int k = 0; k < 12; k++)
                {
                    float a = k * 30f * Mathf.Deg2Rad;
                    bool major = k % 3 == 0;
                    var p = V(-Mathf.Sin(a), Mathf.Cos(a), 0f) * (major ? 0.138f : 0.145f);
                    b.Box(V(p.x, p.y, 0.0185f), V(major ? 0.011f : 0.006f, major ? 0.03f : 0.02f, 0.003f), 2, 0.0005f, 0.1f, Rz(k * 30f), 1);
                }
                // 10:10 - hour hand and minute hand with tails.
                float ah = 305f * Mathf.Deg2Rad, am = 60f * Mathf.Deg2Rad;
                var dh = V(-Mathf.Sin(ah), Mathf.Cos(ah), 0f);
                var dm = V(-Mathf.Sin(am), Mathf.Cos(am), 0f);
                b.Box(dh * 0.038f + V(0, 0, 0.0215f), V(0.011f, 0.095f, 0.002f), 2, 0.0008f, 0.1f, Rz(305f), 1);
                b.Box(dm * 0.052f + V(0, 0, 0.0245f), V(0.007f, 0.14f, 0.002f), 2, 0.0008f, 0.1f, Rz(60f), 1);
                b.Ellipsoid(V(0, 0, 0.026f), V(0.0095f, 0.0095f, 0.005f), 12, 6, 2);
            });
            return root;
        }

        // ================================================================== 22. Outlet + switch

        public GameObject PowerOutlet()
        {
            var root = Root("PowerOutlet");
            Part(root.transform, "Plate", "PowerOutlet", M(m.PlasticWhite, m.PlasticBlack), b =>
            {
                b.Box(V(0, 0, 0.004f), V(0.07f, 0.115f, 0.008f), 0, 0.003f, 0.2f);
                for (int s = -1; s <= 1; s += 2)
                {
                    float y = s * 0.028f;
                    b.Cylinder(V(0, y, 0.0085f), 0.0175f, 0.002f, 20, 0, 0.1f, Rx(90f));
                    b.Cylinder(V(0, y, 0.0098f), 0.0125f, 0.001f, 20, 1, 0.1f, Rx(90f));
                    b.Box(V(-0.0045f, y + 0.003f, 0.0106f), V(0.0028f, 0.011f, 0.0012f), 1, 0f, 0.1f);
                    b.Box(V(0.0045f, y + 0.003f, 0.0106f), V(0.0028f, 0.011f, 0.0012f), 1, 0f, 0.1f);
                    b.Cylinder(V(0, y - 0.0065f, 0.0106f), 0.0026f, 0.0012f, 8, 1, 0.1f, Rx(90f));
                }
                b.Cylinder(V(0, 0, 0.0092f), 0.0038f, 0.002f, 10, 1, 0.1f, Rx(90f));
            });
            return root;
        }

        public GameObject LightSwitch()
        {
            var root = Root("LightSwitch");
            Part(root.transform, "Plate", "LightSwitch", M(m.PlasticWhite, m.PlasticBlack), b =>
            {
                b.Box(V(0, 0, 0.004f), V(0.07f, 0.115f, 0.008f), 0, 0.003f, 0.2f);
                b.Box(V(0, 0, 0.0086f), V(0.032f, 0.062f, 0.002f), 1, 0.002f, 0.1f);
                b.Transform = TRS(V(0, 0, 0.012f), Rx(14f));
                b.Box(V(0, 0, 0), V(0.024f, 0.048f, 0.008f), 0, 0.0035f, 0.1f);
                b.Transform = Matrix4x4.identity;
                b.Cylinder(V(0, 0.0475f, 0.0085f), 0.0034f, 0.0016f, 10, 1, 0.1f, Rx(90f));
                b.Cylinder(V(0, -0.0475f, 0.0085f), 0.0034f, 0.0016f, 10, 1, 0.1f, Rx(90f));
            });
            return root;
        }

        // ================================================================== 23. Front door

        public GameObject FrontDoor()
        {
            var root = Root("FrontDoor");
            Part(root.transform, "Frame", "FrontDoor_Frame", M(m.Trim, m.Brass, m.MetalDark), b =>
            {
                float jx = 0.4775f + 0.04f;
                b.Box(V(-jx, 1.1115f, 0), V(0.08f, 2.223f, 0.12f), 0, 0.004f, 0.5f);
                b.Box(V(jx, 1.1115f, 0), V(0.08f, 2.223f, 0.12f), 0, 0.004f, 0.5f);
                b.Box(V(0, 2.183f, 0), V(1.115f, 0.08f, 0.12f), 0, 0.004f, 0.5f);
                // Casing on both faces and cap moulding.
                for (int s = -1; s <= 1; s += 2)
                {
                    float z = s * 0.0675f;
                    b.Box(V(-0.5875f, 1.12f, z), V(0.07f, 2.24f, 0.015f), 0, 0.004f, 0.5f);
                    b.Box(V(0.5875f, 1.12f, z), V(0.07f, 2.24f, 0.015f), 0, 0.004f, 0.5f);
                    b.Box(V(0, 2.21f, z), V(1.255f, 0.07f, 0.015f), 0, 0.004f, 0.5f);
                }
                b.Box(V(0, 2.262f, 0), V(1.32f, 0.026f, 0.15f), 0, 0.008f, 0.5f);
                // Brass saddle threshold and strike plate.
                b.Box(V(0, 0.008f, 0), V(0.96f, 0.016f, 0.14f), 1, 0.004f, 0.3f);
                b.Box(V(0.4755f, 0.93f, 0), V(0.004f, 0.14f, 0.03f), 1, 0.001f, 0.1f);
                b.Box(V(0.4745f, 0.93f, 0), V(0.002f, 0.07f, 0.014f), 2, 0f, 0.1f);
                // Hinge pins on the jamb side.
                for (int i = 0; i < 3; i++)
                    b.Box(V(-0.4775f, 0.25f + i * 0.8f + 0.02f, 0.0f), V(0.003f, 0.09f, 0.035f), 1, 0.001f, 0.1f);
                // Shop bell bracket on the inside (+Z) face of the head casing.
                b.Box(V(0.30f, 2.215f, 0.0795f), V(0.05f, 0.075f, 0.006f), 1, 0.002f, 0.1f);
                Bar(b, V(0.30f, 2.235f, 0.082f), V(0.30f, 2.305f, 0.13f), 0.014f, 0.012f, 1, 0.002f, Vector3.right);
                Bar(b, V(0.30f, 2.305f, 0.13f), V(0.30f, 2.305f, 0.20f), 0.014f, 0.012f, 1, 0.002f, Vector3.right);
                Tube(b, V(0.30f, 2.305f, 0.20f), V(0.30f, 2.268f, 0.20f), 0.003f, 8, 1);
                b.Lathe(V(0.30f, 2.20f, 0.20f), Pr(0.037f, 0f, 0.035f, 0.006f, 0.027f, 0.03f, 0.019f, 0.05f, 0.011f, 0.062f, 0.0f, 0.065f), 20, 1, false, false, 0.2f);
                b.Ellipsoid(V(0.30f, 2.196f, 0.20f), V(0.008f, 0.008f, 0.008f), 8, 6, 1);
            });

            var hinge = new GameObject("Hinge");
            hinge.transform.SetParent(root.transform, false);
            hinge.transform.localPosition = V(-0.475f, 0f, 0f);

            var leaf = Part(hinge.transform, "Leaf", "FrontDoor_Leaf", M(m.WoodDark, m.Glass, m.Brass, m.MetalDark), b =>
            {
                const float H = 2.12f, T = 0.05f;
                // Frame of the leaf: stiles, rails and lower back board.
                b.Box(V(-0.415f, 0, 0), V(0.12f, H, T), 0, 0.005f, 0.5f);
                b.Box(V(0.415f, 0, 0), V(0.12f, H, T), 0, 0.005f, 0.5f);
                b.Box(V(0, 0.9975f, 0), V(0.71f, 0.125f, T), 0, 0.005f, 0.5f);
                b.Box(V(0, -0.0475f, 0), V(0.71f, 0.105f, T), 0, 0.005f, 0.5f);
                b.Box(V(0, -0.58f, 0), V(0.71f, 0.96f, 0.03f), 0, 0.003f, 0.5f);
                // Raised lower panels with inner fields.
                for (int s = -1; s <= 1; s += 2)
                {
                    for (int f = -1; f <= 1; f += 2)
                    {
                        b.Box(V(s * 0.185f, -0.49f, f * 0.021f), V(0.32f, 0.66f, 0.012f), 0, 0.004f, 0.5f);
                        b.Box(V(s * 0.185f, -0.49f, f * 0.0255f), V(0.23f, 0.56f, 0.006f), 0, 0.003f, 0.5f);
                    }
                }
                // Glass beads and the large pane.
                for (int f = -1; f <= 1; f += 2)
                {
                    float z = f * 0.0225f;
                    b.Box(V(0, 0.927f, z), V(0.71f, 0.016f, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(0, 0.013f, z), V(0.71f, 0.016f, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(-0.347f, 0.47f, z), V(0.016f, 0.93f, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(0.347f, 0.47f, z), V(0.016f, 0.93f, 0.012f), 0, 0.002f, 0.5f);
                }
                b.Quad(V(0, 0.47f, 0), new Vector2(0.71f, 0.93f), 1, null, null, true);
                // Brass kickplates (both faces) with screws.
                for (int f = -1; f <= 1; f += 2)
                {
                    float z = f * 0.0285f;
                    b.Box(V(0, -0.955f, z), V(0.80f, 0.20f, 0.007f), 2, 0.002f, 0.3f);
                    for (int sx = -1; sx <= 1; sx += 2)
                    {
                        for (int sy = -1; sy <= 1; sy += 2)
                            b.Cylinder(V(sx * 0.37f, -0.955f + sy * 0.08f, z + f * 0.004f), 0.004f, 0.002f, 8, 3, 0.1f, Rx(90f));
                    }
                }
                // Knob, rose and keyhole plate on both sides.
                b.Cylinder(V(0.415f, -0.13f, 0), 0.008f, 0.14f, 10, 2, 0.1f, Rx(90f));
                for (int f = -1; f <= 1; f += 2)
                {
                    b.Cylinder(V(0.415f, -0.13f, f * 0.0285f), 0.028f, 0.007f, 18, 2, 0.1f, Rx(90f));
                    b.Ellipsoid(V(0.415f, -0.13f, f * 0.062f), V(0.026f, 0.026f, 0.024f), 16, 10, 2, 0.3f);
                    b.Box(V(0.415f, -0.03f, f * 0.0275f), V(0.03f, 0.07f, 0.005f), 2, 0.002f, 0.1f);
                    b.Box(V(0.415f, -0.03f, f * 0.0302f), V(0.005f, 0.014f, 0.001f), 3, 0f, 0.1f);
                }
                // Hinge knuckles on the leaf's hinge edge.
                for (int i = 0; i < 3; i++)
                {
                    float y = -0.79f + i * 0.8f;
                    b.Cylinder(V(-0.475f, y, 0), 0.009f, 0.09f, 12, 2, 0.1f);
                    b.Box(V(-0.445f, y, 0.0265f), V(0.05f, 0.09f, 0.004f), 2, 0.001f, 0.1f);
                    b.Box(V(-0.445f, y, -0.0265f), V(0.05f, 0.09f, 0.004f), 2, 0.001f, 0.1f);
                }
            }, V(0.475f, 1.08f, 0f));
            Col(leaf, Vector3.zero, V(0.95f, 2.12f, 0.05f));
            return root;
        }

        // ================================================================== 24. Back door

        public GameObject BackDoor()
        {
            var root = Root("BackDoor");
            Part(root.transform, "Frame", "BackDoor_Frame", M(m.Trim), b =>
            {
                float jx = 0.45f + 0.003f + 0.04f;
                b.Box(V(-jx, 1.069f, 0), V(0.08f, 2.138f, 0.10f), 0, 0.004f, 0.5f);
                b.Box(V(jx, 1.069f, 0), V(0.08f, 2.138f, 0.10f), 0, 0.004f, 0.5f);
                b.Box(V(0, 2.098f, 0), V(1.026f, 0.08f, 0.10f), 0, 0.004f, 0.5f);
                for (int s = -1; s <= 1; s += 2)
                {
                    b.Box(V(-0.545f, 1.09f, s * 0.0575f), V(0.06f, 2.18f, 0.015f), 0, 0.004f, 0.5f);
                    b.Box(V(0.545f, 1.09f, s * 0.0575f), V(0.06f, 2.18f, 0.015f), 0, 0.004f, 0.5f);
                    b.Box(V(0, 2.15f, s * 0.0575f), V(1.15f, 0.06f, 0.015f), 0, 0.004f, 0.5f);
                }
            });
            Part(root.transform, "Leaf", "BackDoor_Leaf",
                M(m.WoodDark, m.Glass, m.Brass, m.MetalDark, m.LockedSign, m.PlasticAmber), b =>
            {
                const float W = 0.90f, H = 2.05f, T = 0.045f;
                float wy = 0.72f, ww = 0.32f, wh = 0.32f;          // window centre / size (leaf local)
                float sideW = (W - ww) * 0.5f;
                b.Box(V(-(ww * 0.5f + sideW * 0.5f), 0, 0), V(sideW, H, T), 0, 0.004f, 0.5f);
                b.Box(V((ww * 0.5f + sideW * 0.5f), 0, 0), V(sideW, H, T), 0, 0.004f, 0.5f);
                float botH = (wy - wh * 0.5f) + H * 0.5f;
                float topH = H * 0.5f - (wy + wh * 0.5f);
                b.Box(V(0, -H * 0.5f + botH * 0.5f, 0), V(ww, botH, T), 0, 0.004f, 0.5f);
                b.Box(V(0, H * 0.5f - topH * 0.5f, 0), V(ww, topH, T), 0, 0.004f, 0.5f);
                // Wired glass: pane plus a diamond wire mesh embedded in the opening.
                b.Quad(V(0, wy, 0), new Vector2(ww, wh), 1, null, null, true);
                for (int k = -3; k <= 3; k++)
                {
                    float o = k * 0.058f;
                    b.Box(V(o * 0.7071f, wy + o * 0.7071f, 0), V(0.60f, 0.0022f, 0.0022f), 3, 0f, 0.1f, Rz(45f), 1);
                    b.Box(V(-o * 0.7071f, wy + o * 0.7071f, 0), V(0.60f, 0.0022f, 0.0022f), 3, 0f, 0.1f, Rz(-45f), 1);
                }
                // Window stops on both faces.
                for (int f = -1; f <= 1; f += 2)
                {
                    float z = f * 0.0245f;
                    b.Box(V(0, wy + wh * 0.5f - 0.008f, z), V(ww, 0.016f, 0.008f), 0, 0.002f, 0.5f);
                    b.Box(V(0, wy - wh * 0.5f + 0.008f, z), V(ww, 0.016f, 0.008f), 0, 0.002f, 0.5f);
                    b.Box(V(-ww * 0.5f + 0.008f, wy, z), V(0.016f, wh, 0.008f), 0, 0.002f, 0.5f);
                    b.Box(V(ww * 0.5f - 0.008f, wy, z), V(0.016f, wh, 0.008f), 0, 0.002f, 0.5f);
                }
                // Raised panels below the window, both faces.
                for (int f = -1; f <= 1; f += 2)
                {
                    float z = f * 0.0265f;
                    b.Box(V(-0.19f, -0.52f, z), V(0.27f, 0.82f, 0.008f), 0, 0.003f, 0.5f);
                    b.Box(V(0.19f, -0.52f, z), V(0.27f, 0.82f, 0.008f), 0, 0.003f, 0.5f);
                    b.Box(V(0, -0.10f, z), V(0.78f, 0.12f, 0.006f), 0, 0.003f, 0.5f);
                }
                // Scuffed steel kickplate.
                b.Box(V(0, -0.94f, 0.0245f), V(0.82f, 0.14f, 0.005f), 3, 0.002f, 0.3f);
                b.Box(V(0, -0.94f, -0.0245f), V(0.82f, 0.14f, 0.005f), 3, 0.002f, 0.3f);
                // Worn brass knob and plain deadbolt.
                float ky = -0.04f;
                b.Cylinder(V(0.34f, ky, 0), 0.008f, 0.14f, 10, 2, 0.1f, Rx(90f));
                for (int f = -1; f <= 1; f += 2)
                {
                    b.Cylinder(V(0.34f, ky, f * 0.0245f), 0.027f, 0.006f, 18, 2, 0.1f, Rx(90f));
                    b.Ellipsoid(V(0.34f, ky, f * 0.058f), V(0.025f, 0.025f, 0.022f), 14, 8, 2, 0.3f);
                    b.Cylinder(V(0.34f, ky + 0.12f, f * 0.0245f), 0.022f, 0.006f, 16, 2, 0.1f, Rx(90f));
                    b.Cylinder(V(0.34f, ky + 0.12f, f * 0.034f), 0.012f, 0.012f, 12, 3, 0.1f, Rx(90f));
                }
                // 'LOCKED' sign taped at eye level on the +Z face.
                b.Quad(V(0, 0.36f, T * 0.5f + 0.0012f), new Vector2(0.36f, 0.18f), 4);
                b.Box(V(-0.15f, 0.445f, T * 0.5f + 0.0025f), V(0.07f, 0.022f, 0.0016f), 5, 0.0005f, 0.1f, Rz(-18f), 1);
                b.Box(V(0.15f, 0.445f, T * 0.5f + 0.0025f), V(0.07f, 0.022f, 0.0016f), 5, 0.0005f, 0.1f, Rz(16f), 1);
                b.Box(V(-0.15f, 0.275f, T * 0.5f + 0.0025f), V(0.07f, 0.022f, 0.0016f), 5, 0.0005f, 0.1f, Rz(14f), 1);
                b.Box(V(0.15f, 0.275f, T * 0.5f + 0.0025f), V(0.07f, 0.022f, 0.0016f), 5, 0.0005f, 0.1f, Rz(-20f), 1);
            }, V(0, 1.03f, 0));
            Col(root, V(0, 1.03f, 0), V(0.90f, 2.05f, 0.05f));
            return root;
        }

        // ================================================================== 25. Barber pole

        public GameObject BarberPole()
        {
            var root = Root("BarberPole");
            Part(root.transform, "Hardware", "BarberPole_Hardware", M(m.Brass, m.Chrome), b =>
            {
                for (int i = 0; i < 2; i++)
                {
                    float y = i == 0 ? 0.03f : 0.71f;
                    // Wall plate, arm and a collar around the pole.
                    b.Box(V(0, y, 0.008f), V(0.11f, 0.11f, 0.016f), 0, 0.006f, 0.2f);
                    b.Cylinder(V(0, y, 0.0185f), 0.045f, 0.005f, 20, 0, 0.1f, Rx(90f));
                    b.Box(V(0, y, 0.085f), V(0.05f, 0.04f, 0.14f), 0, 0.008f, 0.2f);
                    b.Torus(V(0.0f, y, 0.16f), 0.088f, 0.0065f, 24, 8, 0);
                    b.Box(V(0, y, 0.1175f), V(0.025f, 0.03f, 0.05f), 0, 0.004f, 0.2f);
                    for (int sx = -1; sx <= 1; sx += 2)
                        for (int sy = -1; sy <= 1; sy += 2)
                            b.Cylinder(V(sx * 0.04f, y + sy * 0.04f, 0.017f), 0.005f, 0.003f, 8, 1, 0.1f, Rx(90f));
                }
                // Chrome caps (bottom and dome top).
                b.Lathe(V(0, 0, 0.16f), Pr(0.06f, 0f, 0.09f, 0.01f, 0.092f, 0.03f, 0.085f, 0.055f, 0.078f, 0.06f), 28, 1, true, false, 0.3f);
                b.Lathe(V(0, 0.68f, 0.16f), Pr(0.078f, 0f, 0.09f, 0.005f, 0.092f, 0.02f, 0.085f, 0.04f, 0.07f, 0.058f, 0.04f, 0.073f, 0.0f, 0.082f), 28, 1, false, false, 0.3f);
                b.Ellipsoid(V(0, 0.775f, 0.16f), V(0.02f, 0.02f, 0.02f), 14, 8, 1);
                b.Torus(V(0, 0.675f, 0.16f), 0.09f, 0.006f, 28, 8, 1);
                b.Torus(V(0, 0.06f, 0.16f), 0.09f, 0.006f, 28, 8, 1);
            });
            // Rotating striped core: UV wraps exactly once around, ~1.3 repeats over the height.
            float circ = 2f * Mathf.PI * 0.075f;
            var stripes = Part(root.transform, "Stripes", "BarberPole_Stripes", M(m.BarberPole), b =>
            {
                b.Lathe(V(0, 0, 0), Pr(0.075f, -0.31f, 0.075f, 0.31f), 32, 0, false, false, circ);
            }, V(0, 0.37f, 0.16f));
            Part(root.transform, "GlassTube", "BarberPole_Glass", M(m.Glass), b =>
            {
                b.Lathe(V(0, 0, 0), Pr(0.085f, -0.31f, 0.085f, 0.31f), 32, 0, false, false, 0.5f);
                b.Lathe(V(0, 0, 0), Pr(0.0845f, 0.31f, 0.0845f, -0.31f), 32, 0, false, false, 0.5f);
            }, V(0, 0.37f, 0.16f));
            return root;
        }

        // ================================================================== 26. Trash props

        public GameObject CrumpledPaper()
        {
            var root = Root("CrumpledPaper");
            PartFromMesh(root.transform, "Mesh", "CrumpledPaper", M(m.Paper), () =>
            {
                var mb = new MeshBuilder();
                mb.Ellipsoid(V(0, 0, 0), V(0.05f, 0.042f, 0.046f), 16, 10, 0, 0.2f);
                var mesh = mb.Build("CrumpledPaper", 1);
                var v = mesh.vertices;
                for (int i = 0; i < v.Length; i++)
                {
                    var p = v[i];
                    float n1 = Mathf.Sin(p.x * 140f + 1.3f) * Mathf.Sin(p.y * 150f + 0.7f);
                    float n2 = Mathf.Sin(p.z * 170f + p.x * 60f) * Mathf.Cos(p.y * 90f - p.z * 40f);
                    float n3 = Mathf.Sin(p.x * 55f + p.y * 40f + p.z * 70f);
                    float d = n1 * 0.006f + n2 * 0.005f + n3 * 0.006f;
                    v[i] = p + p.normalized * d;
                }
                mesh.vertices = v;
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                mesh.RecalculateTangents();
                return mesh;
            }, V(0, 0.043f, 0), null);
            Col(root, V(0, 0.09f, 0), V(0.18f, 0.18f, 0.18f));
            return root;
        }

        public GameObject SodaCan(bool crushed)
        {
            var root = Root("SodaCan");
            Part(root.transform, "Mesh", crushed ? "SodaCan_Crushed" : "SodaCan", M(m.CanRed, m.Chrome), b =>
            {
                if (crushed)
                    b.Transform = Matrix4x4.TRS(V(0f, 0.022f, 0f), Ry(25f) * Rz(86f), V(0.55f, 0.85f, 1f));
                var c = crushed ? V(0, -0.06f, 0) : Vector3.zero;
                b.Lathe(c, Pr(0.028f, 0.006f, 0.033f, 0.014f, 0.033f, 0.104f, 0.028f, 0.112f), 20, 0, false, false, 0.2f);
                b.Lathe(c, Pr(0f, 0.005f, 0.020f, 0.003f, 0.024f, 0f, 0.026f, 0.001f, 0.028f, 0.006f), 20, 1, false, false, 0.2f);
                b.Lathe(c, Pr(0.028f, 0.112f, 0.0255f, 0.117f, 0.0255f, 0.120f, 0.0228f, 0.121f, 0.021f, 0.1185f, 0f, 0.1175f), 20, 1, false, false, 0.2f);
                b.Box(c + V(0.004f, 0.1215f, 0), V(0.012f, 0.0012f, 0.009f), 1, 0.0004f, 0.1f);
                b.Transform = Matrix4x4.identity;
            });
            Col(root, V(0, 0.09f, 0), V(0.18f, 0.18f, 0.18f));
            return root;
        }

        public GameObject EmptyBottle()
        {
            var root = Root("EmptyBottle");
            Part(root.transform, "Mesh", "EmptyBottle", M(m.BottleGreen, m.Paper), b =>
            {
                b.Transform = TRS(V(0.02f, 0.0375f, 0f), Ry(35f) * Rz(90f));
                var c = V(0, -0.14f, 0);
                b.Lathe(c, Pr(0f, 0f, 0.026f, 0f, 0.034f, 0.008f, 0.0375f, 0.02f, 0.0375f, 0.135f, 0.0345f, 0.17f, 0.024f, 0.20f,
                    0.0165f, 0.222f, 0.0148f, 0.26f, 0.0175f, 0.268f, 0.0178f, 0.28f, 0.0125f, 0.28f, 0.0125f, 0.255f), 20, 0, false, false, 0.3f);
                b.Lathe(c, Pr(0.0382f, 0.04f, 0.0382f, 0.115f), 20, 1, false, false, 0.3f);
                b.Transform = Matrix4x4.identity;
            });
            Col(root, V(0, 0.09f, 0), V(0.30f, 0.18f, 0.30f));
            return root;
        }

        public GameObject PizzaBox()
        {
            var root = Root("PizzaBox");
            Part(root.transform, "Mesh", "PizzaBox", M(m.Cardboard, m.Paper), b =>
            {
                b.Box(V(0, 0.0175f, 0), V(0.36f, 0.035f, 0.36f), 0, 0.003f, 0.5f);
                b.Cylinder(V(0, 0.0352f, 0), 0.15f, 0.003f, 24, 1, 0.4f);
                b.Transform = TRS(V(0, 0.035f, -0.18f), Rx(-12f));
                b.Box(V(0, 0.006f, 0.18f), V(0.36f, 0.012f, 0.36f), 0, 0.003f, 0.5f);
                b.Box(V(0, -0.011f, 0.357f), V(0.36f, 0.026f, 0.006f), 0, 0.002f, 0.5f);
                b.Box(V(-0.177f, -0.011f, 0.18f), V(0.006f, 0.026f, 0.36f), 0, 0.002f, 0.5f);
                b.Box(V(0.177f, -0.011f, 0.18f), V(0.006f, 0.026f, 0.36f), 0, 0.002f, 0.5f);
                b.Transform = Matrix4x4.identity;
            });
            Col(root, V(0, 0.09f, 0.0f), V(0.40f, 0.18f, 0.40f));
            return root;
        }

        public GameObject NewspaperPile()
        {
            var root = Root("NewspaperPile");
            Part(root.transform, "Mesh", "NewspaperPile", M(m.Newsprint), b =>
            {
                for (int i = 0; i < 4; i++)
                {
                    float yaw = (Hash(i, 1f, 9f) - 0.5f) * 22f;
                    float ox = (Hash(i, 2f, 9f) - 0.5f) * 0.03f;
                    float oz = (Hash(i, 3f, 9f) - 0.5f) * 0.03f;
                    b.Transform = TRS(V(ox, 0.0075f + i * 0.0155f, oz), Ry(yaw));
                    b.Box(V(0, 0, 0), V(0.32f, 0.015f, 0.42f), 0, 0.004f, 0.4f);
                }
                b.Transform = Matrix4x4.identity;
            });
            Col(root, V(0, 0.09f, 0), V(0.40f, 0.18f, 0.48f));
            return root;
        }

        // ================================================================== 27. Trash bin

        public GameObject TrashBin()
        {
            var root = Root("TrashBin");
            Part(root.transform, "Mesh", "TrashBin", M(m.MetalDark), b =>
            {
                var prof = new List<Vector2>();
                prof.Add(new Vector2(0f, 0f));
                prof.Add(new Vector2(0.122f, 0f));
                prof.Add(new Vector2(0.138f, 0.012f));
                float[] ridges = { 0.11f, 0.20f, 0.29f };
                for (int i = 0; i < 3; i++)
                {
                    float y = ridges[i];
                    float r = 0.138f + (0.17f - 0.138f) * (y - 0.012f) / 0.368f;
                    prof.Add(new Vector2(r - 0.001f, y - 0.014f));
                    prof.Add(new Vector2(r + 0.005f, y - 0.007f));
                    prof.Add(new Vector2(r + 0.005f, y + 0.007f));
                    prof.Add(new Vector2(r - 0.001f, y + 0.014f));
                }
                prof.Add(new Vector2(0.17f, 0.38f));
                prof.Add(new Vector2(0.178f, 0.385f));
                prof.Add(new Vector2(0.182f, 0.395f));
                prof.Add(new Vector2(0.178f, 0.405f));
                prof.Add(new Vector2(0.170f, 0.404f));
                prof.Add(new Vector2(0.166f, 0.395f));
                prof.Add(new Vector2(0.165f, 0.38f));
                prof.Add(new Vector2(0.132f, 0.03f));
                prof.Add(new Vector2(0f, 0.03f));
                b.Lathe(V(0, 0, 0), prof, 32, 0, false, false, 0.4f);
            });
            Col(root, V(0, 0.205f, 0), V(0.38f, 0.41f, 0.38f));
            return root;
        }

        // ================================================================== 28. Radiator

        public GameObject Radiator(float width)
        {
            var root = Root("Radiator");
            int n = Mathf.Max(3, Mathf.RoundToInt(width / 0.075f));
            Part(root.transform, "Mesh", string.Format("Radiator_{0:0.00}", width), M(m.Ceramic, m.MetalDark, m.Brass), b =>
            {
                float pitch = (width - 0.06f) / n;
                b.Box(V(0, 0.06f, 0.05f), V(width, 0.04f, 0.09f), 0, 0.012f, 0.4f);
                b.Box(V(0, 0.5775f, 0.05f), V(width, 0.045f, 0.09f), 0, 0.012f, 0.4f);
                for (int i = 0; i < n; i++)
                {
                    float x = -width * 0.5f + 0.03f + pitch * (i + 0.5f);
                    b.Box(V(x, 0.3175f, 0.05f), V(pitch * 0.86f, 0.485f, 0.075f), 0, 0.014f, 0.4f);
                    b.Box(V(x, 0.3175f, 0.0885f), V(pitch * 0.30f, 0.47f, 0.008f), 0, 0.003f, 0.4f);
                }
                for (int s = -1; s <= 1; s += 2)
                {
                    b.Box(V(s * (width * 0.5f - 0.05f), 0.02f, 0.05f), V(0.05f, 0.04f, 0.07f), 1, 0.006f, 0.3f);
                }
                // Valve on the right end.
                b.Cylinder(V(width * 0.5f + 0.02f, 0.06f, 0.05f), 0.013f, 0.04f, 12, 2, 0.1f, Rz(90f));
                b.Ellipsoid(V(width * 0.5f + 0.045f, 0.06f, 0.05f), V(0.02f, 0.02f, 0.02f), 12, 8, 2);
                b.Cylinder(V(width * 0.5f + 0.045f, 0.09f, 0.05f), 0.006f, 0.04f, 8, 2, 0.1f);
                b.Cylinder(V(width * 0.5f + 0.045f, 0.112f, 0.05f), 0.02f, 0.006f, 14, 1, 0.1f);
                b.Cylinder(V(-width * 0.5f - 0.012f, 0.57f, 0.05f), 0.01f, 0.025f, 10, 1, 0.1f, Rz(90f));
            });
            return root;
        }

        // ================================================================== 29. Ladder

        public GameObject Ladder()
        {
            var root = Root("Ladder");
            Part(root.transform, "Mesh", "Ladder", M(m.WoodFloor, m.MetalDark), b =>
            {
                const float top = 1.5f;
                for (int s = -1; s <= 1; s += 2)
                {
                    var fb = V(s * 0.23f, 0f, 0.36f);
                    var ft = V(s * 0.20f, top, 0.06f);
                    var bb = V(s * 0.23f, 0f, -0.44f);
                    var bt = V(s * 0.19f, top - 0.04f, -0.04f);
                    Bar(b, fb, ft, 0.045f, 0.022f, 0, 0.004f, Vector3.forward);
                    Bar(b, bb, bt, 0.04f, 0.02f, 0, 0.004f, Vector3.forward);
                    b.Box(V(s * 0.23f, 0.008f, 0.36f), V(0.055f, 0.016f, 0.045f), 1, 0.004f, 0.1f);
                    b.Box(V(s * 0.23f, 0.008f, -0.44f), V(0.05f, 0.016f, 0.04f), 1, 0.004f, 0.1f);
                    // Folding spreader.
                    var sa = Vector3.Lerp(fb, ft, 0.48f);
                    var sb = Vector3.Lerp(bb, bt, 0.48f);
                    Bar(b, sa, sb, 0.02f, 0.006f, 1, 0.001f, Vector3.right);
                    b.Cylinder(sa + V(s * -0.012f, 0, 0), 0.007f, 0.01f, 8, 1, 0.1f, Rz(90f));
                    b.Cylinder(sb + V(s * -0.012f, 0, 0), 0.007f, 0.01f, 8, 1, 0.1f, Rz(90f));
                }
                float[] fr = { 0.2f, 0.4f, 0.6f, 0.8f };
                for (int i = 0; i < fr.Length; i++)
                {
                    var p = Vector3.Lerp(V(0.23f, 0f, 0.36f), V(0.20f, top, 0.06f), fr[i]);
                    p.x = 0f;
                    p.z = Mathf.Lerp(0.36f, 0.06f, fr[i]);
                    float halfW = Mathf.Lerp(0.23f, 0.20f, fr[i]);
                    b.Box(V(0, p.y, p.z + 0.01f), V(halfW * 2f - 0.03f, 0.022f, 0.11f), 0, 0.005f, 0.4f);
                }
                b.Box(V(0, top + 0.012f, 0.01f), V(0.46f, 0.03f, 0.28f), 0, 0.008f, 0.4f);
                for (int i = 0; i < 2; i++)
                {
                    float f = 0.35f + i * 0.4f;
                    var p = Vector3.Lerp(V(0, 0f, -0.44f), V(0, top - 0.04f, -0.04f), f);
                    float halfW = Mathf.Lerp(0.23f, 0.19f, f);
                    b.Box(V(0, p.y, p.z), V(halfW * 2f - 0.03f, 0.03f, 0.022f), 0, 0.004f, 0.4f);
                }
                // Paint tray ledge and hinge plate.
                b.Box(V(0, top + 0.03f, -0.06f), V(0.42f, 0.014f, 0.05f), 1, 0.004f, 0.1f);
            });
            return root;
        }

        // ================================================================== 30. Paint bucket

        public GameObject PaintBucket(bool lid)
        {
            var root = Root("PaintBucket");
            Part(root.transform, "Mesh", lid ? "PaintBucket_Lid" : "PaintBucket_Open", M(m.PaintBucket, m.MetalDark, m.Trim), b =>
            {
                var prof = new List<Vector2>();
                prof.Add(new Vector2(0.088f, 0f));
                prof.Add(new Vector2(0.094f, 0.008f));
                float[] rib = { 0.07f, 0.13f, 0.19f };
                for (int i = 0; i < 3; i++)
                {
                    float y = rib[i];
                    float r = 0.095f + (0.106f - 0.095f) * (y / 0.24f);
                    prof.Add(new Vector2(r, y - 0.012f));
                    prof.Add(new Vector2(r + 0.004f, y - 0.005f));
                    prof.Add(new Vector2(r + 0.004f, y + 0.005f));
                    prof.Add(new Vector2(r, y + 0.012f));
                }
                prof.Add(new Vector2(0.107f, 0.236f));
                prof.Add(new Vector2(0.115f, 0.240f));
                prof.Add(new Vector2(0.117f, 0.248f));
                prof.Add(new Vector2(0.113f, 0.253f));
                prof.Add(new Vector2(0.108f, 0.249f));
                prof.Add(new Vector2(0.106f, 0.240f));
                prof.Add(new Vector2(0.103f, 0.20f));
                prof.Add(new Vector2(0.090f, 0.012f));
                prof.Add(new Vector2(0f, 0.012f));
                b.Lathe(V(0, 0, 0), prof, 28, 0, true, false, 0.3f);
                if (lid)
                {
                    b.Lathe(V(0, 0, 0), Pr(0.118f, 0.243f, 0.121f, 0.248f, 0.121f, 0.262f, 0.117f, 0.266f, 0.09f, 0.266f, 0.087f, 0.262f, 0.0f, 0.262f), 28, 0, true, false, 0.3f);
                    b.Cylinder(V(0, 0.264f, 0), 0.02f, 0.006f, 14, 1, 0.1f);
                }
                else
                {
                    b.Cylinder(V(0, 0.19f, 0), 0.1035f, 0.004f, 28, 2, 0.3f);
                    for (int i = 0; i < 3; i++)
                    {
                        float a = (35f + i * 118f) * Mathf.Deg2Rad;
                        float len = 0.03f + i * 0.012f;
                        b.Ellipsoid(V(Mathf.Cos(a) * 0.1095f, 0.238f - len * 0.5f, Mathf.Sin(a) * 0.1095f), V(0.0035f, len, 0.007f), 8, 6, 2, 0.1f, Ry(-a * Mathf.Rad2Deg));
                    }
                }
                // Wire handle (half torus) and ear lugs.
                var tube = new Vector2[9];
                for (int i = 0; i <= 8; i++)
                {
                    float a = -Mathf.PI + 2f * Mathf.PI * i / 8f;
                    tube[i] = new Vector2(0.114f + Mathf.Cos(a) * 0.0028f, Mathf.Sin(a) * 0.0028f);
                }
                b.Lathe(V(0, 0.235f, 0), tube, 20, 1, false, false, 0.1f, Rx(-90f), 180f);
                b.Box(V(0.113f, 0.236f, 0), V(0.02f, 0.03f, 0.014f), 1, 0.003f, 0.1f);
                b.Box(V(-0.113f, 0.236f, 0), V(0.02f, 0.03f, 0.014f), 1, 0.003f, 0.1f);
            });
            return root;
        }

        // ================================================================== 31. Covered chair

        public GameObject CoveredChair()
        {
            var root = Root("CoveredChair");
            Part(root.transform, "Mesh", "CoveredChair", M(m.DustSheet), b =>
            {
                const float uv = 0.6f;
                b.Box(V(0, 0.07f, 0.0f), V(0.78f, 0.14f, 0.74f), 0, 0.055f, uv, null, 3);
                b.Box(V(0, 0.27f, 0.04f), V(0.66f, 0.30f, 0.62f), 0, 0.07f, uv, Rx(-2f), 3);
                b.Transform = TRS(V(0, 0.64f, -0.25f), Rx(-9f));
                b.Box(V(0, 0, 0), V(0.68f, 0.70f, 0.20f), 0, 0.08f, uv, null, 3);
                b.Ellipsoid(V(0, 0.38f, 0.0f), V(0.30f, 0.11f, 0.10f), 14, 8, 0, uv);
                b.Transform = Matrix4x4.identity;
                for (int s = -1; s <= 1; s += 2)
                {
                    b.Box(V(s * 0.345f, 0.41f, 0.02f), V(0.15f, 0.34f, 0.64f), 0, 0.065f, uv, Rz(s * -3f), 3);
                    b.Ellipsoid(V(s * 0.345f, 0.60f, 0.06f), V(0.085f, 0.05f, 0.28f), 12, 8, 0, uv);
                }
                b.Ellipsoid(V(0, 0.46f, 0.07f), V(0.28f, 0.10f, 0.26f), 14, 8, 0, uv);
                b.Ellipsoid(V(0.03f, 0.99f, -0.27f), V(0.27f, 0.10f, 0.11f), 14, 8, 0, uv, Rz(-5f));
                // Draped folds pooling at the floor.
                b.Ellipsoid(V(0.20f, 0.045f, 0.39f), V(0.17f, 0.055f, 0.07f), 12, 6, 0, uv, Ry(10f));
                b.Ellipsoid(V(-0.22f, 0.04f, 0.38f), V(0.14f, 0.05f, 0.06f), 12, 6, 0, uv, Ry(-14f));
                b.Ellipsoid(V(0.40f, 0.05f, -0.1f), V(0.07f, 0.055f, 0.2f), 12, 6, 0, uv, Ry(-8f));
                b.Ellipsoid(V(-0.40f, 0.045f, 0.05f), V(0.07f, 0.05f, 0.17f), 12, 6, 0, uv, Ry(6f));
                b.Ellipsoid(V(0.1f, 0.05f, -0.4f), V(0.2f, 0.05f, 0.06f), 12, 6, 0, uv);
            });
            Col(root, V(0, 0.5f, -0.02f), V(0.82f, 1.0f, 0.80f));
            return root;
        }

        // ================================================================== 32. Locker

        public GameObject Locker()
        {
            var root = Root("Locker");
            Part(root.transform, "Mesh", "Locker", M(m.Trim, m.MetalDark, m.Chrome), b =>
            {
                b.Box(V(0, 0.02f, 0), V(0.56f, 0.04f, 0.46f), 1, 0.004f, 0.3f);
                b.Box(V(0, 0.92f, 0), V(0.60f, 1.76f, 0.50f), 0, 0.01f, 0.5f);
                // Door with dark reveals.
                b.Box(V(0, 0.92f, 0.2515f), V(0.57f, 1.72f, 0.003f), 1, 0f, 0.3f);
                b.Box(V(0, 0.92f, 0.258f), V(0.55f, 1.70f, 0.012f), 0, 0.004f, 0.5f);
                // Vents (upper and lower), inset slots.
                for (int g = 0; g < 2; g++)
                {
                    float y0 = g == 0 ? 1.66f : 0.30f;
                    b.Box(V(0, y0 - 0.07f, 0.2645f), V(0.40f, 0.17f, 0.002f), 1, 0f, 0.3f);
                    for (int i = 0; i < 6; i++)
                        b.Box(V(0, y0 - 0.005f - i * 0.028f, 0.2665f), V(0.36f, 0.012f, 0.003f), 1, 0.0008f, 0.3f);
                }
                // Hinges, handle with latch, number plate.
                for (int i = 0; i < 3; i++)
                    b.Cylinder(V(-0.287f, 0.35f + i * 0.55f, 0.265f), 0.007f, 0.09f, 8, 1, 0.1f);
                b.Box(V(0.17f, 0.95f, 0.267f), V(0.05f, 0.16f, 0.012f), 2, 0.004f, 0.2f);
                b.Box(V(0.17f, 0.95f, 0.275f), V(0.016f, 0.09f, 0.012f), 1, 0.004f, 0.2f);
                b.Box(V(0.0f, 1.46f, 0.265f), V(0.09f, 0.04f, 0.003f), 2, 0.001f, 0.2f);
            });
            Col(root, V(0, 0.9f, 0), V(0.60f, 1.80f, 0.50f));
            return root;
        }

        // ================================================================== 33. Street lamp

        public GameObject StreetLamp()
        {
            var root = Root("StreetLamp");
            Part(root.transform, "Lamp", "StreetLamp", M(m.MetalDark, m.Glass, m.Brass), b =>
            {
                b.Lathe(V(0, 0, 0), Pr(0.17f, 0f, 0.17f, 0.03f, 0.155f, 0.05f, 0.155f, 0.09f, 0.13f, 0.13f, 0.10f, 0.20f, 0.085f, 0.35f,
                    0.07f, 0.55f, 0.062f, 0.80f, 0.052f, 0.86f, 0.045f, 0.95f, 0.042f, 1.5f, 0.039f, 2.4f, 0.036f, 2.96f), 24, 0, true, false, 0.5f);
                float[] rings = { 0.9f, 1.8f, 2.6f };
                float[] rr = { 0.05f, 0.04f, 0.037f };
                for (int i = 0; i < 3; i++)
                {
                    b.Torus(V(0, rings[i], 0), rr[i], 0.009f, 24, 6, 2);
                    b.Torus(V(0, rings[i] + 0.04f, 0), rr[i] - 0.002f, 0.005f, 24, 6, 2);
                }
                // Ladder bar and rest knobs.
                b.Box(V(0, 2.55f, 0), V(0.46f, 0.02f, 0.02f), 0, 0.005f, 0.3f);
                b.Ellipsoid(V(0.235f, 2.55f, 0), V(0.016f, 0.016f, 0.016f), 10, 6, 0);
                b.Ellipsoid(V(-0.235f, 2.55f, 0), V(0.016f, 0.016f, 0.016f), 10, 6, 0);
                // Lantern: floor, glass, corner posts, roof, finial.
                b.Lathe(V(0, 0, 0), Pr(0.05f, 2.95f, 0.10f, 2.985f, 0.145f, 3.0f, 0.15f, 3.02f), 24, 0, false, true, 0.3f);
                b.Frustum(V(0, 3.17f, 0), 0.115f, 0.15f, 0.30f, 8, 1, 0.3f, null, false);
                for (int k = 0; k < 8; k++)
                {
                    float a = k * 45f * Mathf.Deg2Rad;
                    var lo = V(Mathf.Cos(a) * 0.117f, 3.02f, Mathf.Sin(a) * 0.117f);
                    var hi = V(Mathf.Cos(a) * 0.152f, 3.32f, Mathf.Sin(a) * 0.152f);
                    Tube(b, lo, hi, 0.0075f, 6, 0);
                }
                b.Lathe(V(0, 0, 0), Pr(0.175f, 3.32f, 0.178f, 3.34f, 0.16f, 3.36f, 0.10f, 3.42f, 0.05f, 3.47f, 0.03f, 3.50f), 24, 0, true, true, 0.3f);
                b.Torus(V(0, 3.33f, 0), 0.165f, 0.008f, 24, 6, 2);
                b.Ellipsoid(V(0, 3.525f, 0), V(0.028f, 0.03f, 0.028f), 12, 8, 2);
                b.Frustum(V(0, 3.59f, 0), 0.012f, 0.002f, 0.1f, 8, 0, 0.1f);
            });
            Part(root.transform, "Bulb", "StreetLamp_Bulb", M(m.BulbWarm), b =>
            {
                b.Ellipsoid(V(0, 0, 0), V(0.05f, 0.065f, 0.05f), 14, 10, 0, 0.2f);
            }, V(0, 3.16f, 0));
            return root;
        }

        // ================================================================== 34. Window frame

        public GameObject WindowFrame(float width, float height)
        {
            var root = Root("WindowFrame");
            Part(root.transform, "Frame", string.Format("WindowFrame_{0:0.00}x{1:0.00}", width, height), M(m.Trim, m.Glass), b =>
            {
                float hw = width * 0.5f, hh = height * 0.5f, fw = 0.06f, T = 0.12f;
                b.Box(V(-hw - fw * 0.5f, 0, 0), V(fw, height + fw * 2f, T), 0, 0.006f, 0.5f);
                b.Box(V(hw + fw * 0.5f, 0, 0), V(fw, height + fw * 2f, T), 0, 0.006f, 0.5f);
                b.Box(V(0, hh + fw * 0.5f, 0), V(width, fw, T), 0, 0.006f, 0.5f);
                b.Box(V(0, -hh - fw * 0.5f, 0), V(width, fw, T), 0, 0.006f, 0.5f);
                // Sill projects into the room (+Z) with a drip nose.
                b.Box(V(0, -hh - fw - 0.02f, 0.05f), V(width + 0.20f, 0.04f, 0.22f), 0, 0.01f, 0.5f);
                // Mullion at 70% height with glazing beads on both faces.
                float my = -hh + height * 0.7f;
                b.Box(V(0, my, 0), V(width, 0.04f, 0.08f), 0, 0.005f, 0.5f);
                for (int f = -1; f <= 1; f += 2)
                {
                    float z = f * 0.045f;
                    b.Box(V(-hw + 0.008f, 0, z), V(0.016f, height, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(hw - 0.008f, 0, z), V(0.016f, height, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(0, hh - 0.008f, z), V(width, 0.016f, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(0, -hh + 0.008f, z), V(width, 0.016f, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(0, my + 0.028f, z), V(width, 0.016f, 0.012f), 0, 0.002f, 0.5f);
                    b.Box(V(0, my - 0.028f, z), V(width, 0.016f, 0.012f), 0, 0.002f, 0.5f);
                }
                // Outer casing on the room face.
                b.Box(V(-hw - fw - 0.025f, 0, 0.0675f), V(0.05f, height + fw * 2f + 0.1f, 0.015f), 0, 0.004f, 0.5f);
                b.Box(V(hw + fw + 0.025f, 0, 0.0675f), V(0.05f, height + fw * 2f + 0.1f, 0.015f), 0, 0.004f, 0.5f);
                b.Box(V(0, hh + fw + 0.025f, 0.0675f), V(width + fw * 2f + 0.1f, 0.05f, 0.015f), 0, 0.004f, 0.5f);
                b.Quad(V(0, 0, 0), new Vector2(width, height), 1, null, null, true);
            });
            return root;
        }

        // ================================================================== 35. Mirror frame

        public GameObject MirrorFrame(float width, float height)
        {
            var root = Root("MirrorFrame");
            Part(root.transform, "Frame", string.Format("MirrorFrame_{0:0.00}x{1:0.00}", width, height), M(m.WoodDark, m.Brass), b =>
            {
                float hw = width * 0.5f, hh = height * 0.5f, fw = 0.09f, zc = 0.025f, T = 0.05f;
                b.Box(V(0, hh + fw * 0.5f, zc), V(width + fw * 2f, fw, T), 0, 0.014f, 0.5f, null, 3);
                b.Box(V(0, -hh - fw * 0.5f, zc), V(width + fw * 2f, fw, T), 0, 0.014f, 0.5f, null, 3);
                b.Box(V(-hw - fw * 0.5f, 0, zc), V(fw, height, T), 0, 0.014f, 0.5f, null, 3);
                b.Box(V(hw + fw * 0.5f, 0, zc), V(fw, height, T), 0, 0.014f, 0.5f, null, 3);
                // Stepped moulding: raised wooden bead mid-frame and brass inner lip.
                b.Box(V(0, hh + fw * 0.5f, 0.0525f), V(width + fw * 2f - 0.04f, 0.026f, 0.012f), 0, 0.005f, 0.5f);
                b.Box(V(0, -hh - fw * 0.5f, 0.0525f), V(width + fw * 2f - 0.04f, 0.026f, 0.012f), 0, 0.005f, 0.5f);
                b.Box(V(-hw - fw * 0.5f, 0, 0.0525f), V(0.026f, height + 0.0f, 0.012f), 0, 0.005f, 0.5f);
                b.Box(V(hw + fw * 0.5f, 0, 0.0525f), V(0.026f, height + 0.0f, 0.012f), 0, 0.005f, 0.5f);
                b.Box(V(0, hh + 0.007f, 0.046f), V(width + 0.028f, 0.014f, 0.01f), 1, 0.003f, 0.2f);
                b.Box(V(0, -hh - 0.007f, 0.046f), V(width + 0.028f, 0.014f, 0.01f), 1, 0.003f, 0.2f);
                b.Box(V(-hw - 0.007f, 0, 0.046f), V(0.014f, height, 0.01f), 1, 0.003f, 0.2f);
                b.Box(V(hw + 0.007f, 0, 0.046f), V(0.014f, height, 0.01f), 1, 0.003f, 0.2f);
                // Corner rosettes and top crest.
                for (int sx = -1; sx <= 1; sx += 2)
                {
                    for (int sy = -1; sy <= 1; sy += 2)
                    {
                        var c = V(sx * (hw + fw * 0.5f), sy * (hh + fw * 0.5f), 0.056f);
                        b.Ellipsoid(c, V(0.034f, 0.034f, 0.01f), 14, 8, 1, 0.2f);
                        b.Ellipsoid(c + V(0, 0, 0.008f), V(0.014f, 0.014f, 0.008f), 10, 6, 0, 0.2f);
                    }
                }
                b.Box(V(0, hh + fw + 0.03f, zc), V(0.30f, 0.07f, 0.04f), 0, 0.02f, 0.5f, null, 3);
                b.Ellipsoid(V(0, hh + fw + 0.03f, 0.05f), V(0.09f, 0.03f, 0.012f), 16, 8, 1, 0.2f);
                b.Ellipsoid(V(0, hh + fw + 0.075f, zc), V(0.025f, 0.025f, 0.02f), 12, 8, 1, 0.2f);
                // Studs along the mid bead.
                int studs = Mathf.Max(2, Mathf.RoundToInt(width / 0.2f));
                for (int i = 0; i < studs; i++)
                {
                    float x = -hw + width * (i + 0.5f) / studs;
                    b.Ellipsoid(V(x, hh + fw * 0.5f, 0.0585f), V(0.01f, 0.01f, 0.006f), 8, 6, 1, 0.1f);
                    b.Ellipsoid(V(x, -hh - fw * 0.5f, 0.0585f), V(0.01f, 0.01f, 0.006f), 8, 6, 1, 0.1f);
                }
            });
            return root;
        }
    }
}
