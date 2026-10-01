using System.Collections.Generic;
using BarberSimulator.Art;
using BarberSimulator.Characters;
using BarberSimulator.NPC;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Builds the humanoid characters: a skinned body exported from Blender (see <see cref="SkinnedCharacterParts"/>)
    /// on the same joint hierarchy the procedural animator drives, variant slots for facial hair / tops / accessories,
    /// the cuttable hair shell and a <see cref="ModularCharacter"/>. Falls back to the older rigid-part body if the
    /// export is missing.
    /// </summary>
    public sealed class CharacterFactory
    {
        private readonly MaterialLibrary m;
        private readonly Dictionary<string, Mesh> _cache = new Dictionary<string, Mesh>();

        public CharacterFactory(MaterialLibrary materials)
        {
            m = materials;
        }

        private Mesh MeshFor(string name, System.Action<MeshBuilder> build)
        {
            if (_cache.TryGetValue(name, out var cached) && cached != null) return cached;
            var builder = new MeshBuilder();
            build(builder);
            var mesh = AssetUtility.SaveMesh(builder.Build("Char_" + name), "Char_" + name);
            _cache[name] = mesh;
            return mesh;
        }

        private Renderer Part(Transform parent, string name, string meshName, Material material, System.Action<MeshBuilder> build, Vector3 localPosition = default)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.AddComponent<MeshFilter>().sharedMesh = MeshFor(meshName, build);
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            return renderer;
        }

        private static Transform Joint(Transform parent, string name, Vector3 localPosition)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            return go.transform;
        }

        // Skull ellipsoid in Head-joint space; the dynamic hair shell sits 2 mm above it.
        private static readonly Vector3 SkullCenter = new Vector3(0f, 0.115f, -0.004f);
        private static readonly Vector3 SkullRadii = new Vector3(0.084f, 0.104f, 0.098f);

        private static Vector2[] Profile(params float[] values)
        {
            var points = new Vector2[values.Length / 2];
            for (int i = 0; i < points.Length; i++) points[i] = new Vector2(values[i * 2], values[i * 2 + 1]);
            return points;
        }

        /// <summary>Lathe with an elliptical cross-section (x and z scaled), used for torso, limbs and clothing.</summary>
        private static void Oval(MeshBuilder b, Vector3 center, Vector2[] profile, float scaleX, float scaleZ, int segments = 18, bool capBottom = false, bool capTop = false)
        {
            var previous = b.Transform;
            b.Transform = previous * Matrix4x4.TRS(center, Quaternion.identity, new Vector3(scaleX, 1f, scaleZ));
            b.Lathe(Vector3.zero, profile, segments, 0, capBottom, capTop, 0.5f);
            b.Transform = previous;
        }

        public GameObject Create(string name, CharacterAppearanceData appearance, bool withMotor)
        {
            var parts = SkinnedCharacterParts.Load();
            return parts != null ? CreateSkinned(name, appearance, withMotor, parts) : CreateProcedural(name, appearance, withMotor);
        }

        /// <summary>Legacy jointed body made of rigid parts; only used when the Blender export is missing.</summary>
        private GameObject CreateProcedural(string name, CharacterAppearanceData appearance, bool withMotor)
        {
            var root = new GameObject(name);
            var body = Joint(root.transform, "Body", Vector3.zero);

            var skin = new List<Renderer>();
            var hair = new List<Renderer>();
            var top = new List<Renderer>();
            var pants = new List<Renderer>();
            var shoes = new List<Renderer>();
            var topObjects = new[] { new List<GameObject>(), new List<GameObject>(), new List<GameObject>(), new List<GameObject>() };

            // ---------------- Pelvis & legs
            var pelvis = Joint(body, "Pelvis", new Vector3(0f, 0.98f, 0f));
            pants.Add(Part(pelvis, "Hips", "Hips_v2", m.Pants, b => Oval(b, Vector3.zero,
                Profile(0.12f, -0.12f, 0.165f, -0.06f, 0.17f, 0.02f, 0.155f, 0.1f), 1.05f, 0.72f, 20, true, true)));
            shoes.Add(Part(pelvis, "Belt", "Belt_v2", m.Shoes, b => Oval(b, Vector3.zero,
                Profile(0.158f, 0.07f, 0.16f, 0.072f, 0.16f, 0.105f, 0.158f, 0.107f), 1.05f, 0.73f, 20)));
            Part(pelvis, "Buckle", "Buckle", m.Brass, b => b.Box(new Vector3(0f, 0.088f, 0.122f), new Vector3(0.05f, 0.034f, 0.008f), 0, 0.003f));

            Transform thighL = null, thighR = null, shinL = null, shinR = null;
            for (int side = -1; side <= 1; side += 2)
            {
                string s = side < 0 ? "L" : "R";
                var hip = Joint(pelvis, "Thigh" + s, new Vector3(0.09f * side, -0.06f, 0f));
                pants.Add(Part(hip, "ThighMesh", "Thigh_v2", m.Pants, b => Oval(b, Vector3.zero,
                    Profile(0.056f, -0.46f, 0.06f, -0.4f, 0.07f, -0.25f, 0.082f, -0.08f, 0.085f, 0.02f, 0.06f, 0.06f), 1f, 1.08f, 16, false, true)));
                var knee = Joint(hip, "Shin" + s, new Vector3(0f, -0.44f, 0f));
                pants.Add(Part(knee, "ShinMesh", "Shin_v2", m.Pants, b => Oval(b, Vector3.zero,
                    Profile(0.058f, -0.43f, 0.054f, -0.36f, 0.058f, -0.2f, 0.062f, -0.06f, 0.058f, 0.03f), 1f, 1.05f, 16, true, true)));
                shoes.Add(Part(knee, "Shoe", "Shoe_v2", m.Shoes, b =>
                {
                    // Heel, rounded toe box, thicker sole and a tongue line for the laces.
                    b.Box(new Vector3(0f, -0.452f, -0.01f), new Vector3(0.094f, 0.07f, 0.12f), 0, 0.03f, 0.3f, null, 3);
                    b.Ellipsoid(new Vector3(0f, -0.46f, 0.08f), new Vector3(0.05f, 0.04f, 0.1f), 14, 8, 0);
                    b.Box(new Vector3(0f, -0.488f, 0.04f), new Vector3(0.102f, 0.018f, 0.27f), 0, 0.008f, 0.3f);
                    b.Box(new Vector3(0f, -0.425f, 0.075f), new Vector3(0.036f, 0.012f, 0.09f), 0, 0.004f, 0.3f, Quaternion.Euler(18f, 0f, 0f));
                }));
                if (side < 0) { thighL = hip; shinL = knee; } else { thighR = hip; shinR = knee; }
            }

            // ---------------- Torso (base body, mostly hidden by clothing variants)
            var spine = Joint(pelvis, "Spine", new Vector3(0f, 0.08f, 0f));
            var torsoProfile = Profile(0.15f, -0.02f, 0.152f, 0.08f, 0.16f, 0.2f, 0.18f, 0.34f, 0.182f, 0.41f, 0.15f, 0.49f, 0.085f, 0.555f, 0.058f, 0.575f);

            // 0 T-shirt
            var tee = Part(spine, "Top_TShirt", "Torso_Tee", m.Cloth, b =>
            {
                Oval(b, Vector3.zero, torsoProfile, 1.0f, 0.66f, 22, true, false);
                b.Torus(new Vector3(0f, 0.555f, 0.005f), 0.058f, 0.01f, 16, 8, 0); // crew collar
            });
            top.Add(tee); topObjects[0].Add(tee.gameObject);

            // 1 Hoodie
            var hoodie = Part(spine, "Top_Hoodie", "Torso_Hoodie", m.Cloth, b =>
            {
                Oval(b, Vector3.zero, Profile(0.16f, -0.06f, 0.165f, 0.08f, 0.175f, 0.2f, 0.192f, 0.34f, 0.197f, 0.42f, 0.168f, 0.5f, 0.095f, 0.56f, 0.065f, 0.58f), 1.0f, 0.7f, 22, true, false);
                b.Ellipsoid(new Vector3(0f, 0.55f, -0.08f), new Vector3(0.1f, 0.06f, 0.06f), 14, 8, 0); // hood bunched behind the neck
                b.Box(new Vector3(0f, 0.11f, 0.122f), new Vector3(0.2f, 0.11f, 0.02f), 0, 0.01f, 0.5f);   // kangaroo pocket
                b.Cylinder(new Vector3(-0.025f, 0.46f, 0.112f), 0.004f, 0.1f, 6, 0);
                b.Cylinder(new Vector3(0.025f, 0.46f, 0.112f), 0.004f, 0.1f, 6, 0);
            });
            top.Add(hoodie); topObjects[1].Add(hoodie.gameObject);

            // 2 Jacket (open over a cream shirt)
            var jacket = Part(spine, "Top_Jacket", "Torso_Jacket_v2", m.Cloth, b =>
            {
                Oval(b, Vector3.zero, Profile(0.168f, -0.1f, 0.17f, 0.08f, 0.18f, 0.2f, 0.2f, 0.34f, 0.205f, 0.43f, 0.172f, 0.5f, 0.1f, 0.56f, 0.07f, 0.585f), 1.0f, 0.7f, 22, true, false);
                b.Box(new Vector3(-0.055f, 0.4f, 0.125f), new Vector3(0.05f, 0.2f, 0.016f), 0, 0.006f, 0.5f, Quaternion.Euler(0f, 0f, -16f));
                b.Box(new Vector3(0.055f, 0.4f, 0.125f), new Vector3(0.05f, 0.2f, 0.016f), 0, 0.006f, 0.5f, Quaternion.Euler(0f, 0f, 16f));
            });
            top.Add(jacket); topObjects[2].Add(jacket.gameObject);
            var innerShirt = Part(spine, "Top_JacketShirt", "Torso_JacketShirt", m.FabricCream, b =>
                b.Box(new Vector3(0f, 0.3f, 0.126f), new Vector3(0.07f, 0.42f, 0.01f), 0, 0.004f, 0.5f));
            topObjects[2].Add(innerShirt.gameObject);

            // 3 Sweater (ribbed hem)
            var sweater = Part(spine, "Top_Sweater", "Torso_Sweater", m.Cloth, b =>
            {
                Oval(b, Vector3.zero, Profile(0.155f, -0.07f, 0.162f, 0.08f, 0.172f, 0.2f, 0.19f, 0.34f, 0.195f, 0.42f, 0.166f, 0.5f, 0.092f, 0.56f, 0.062f, 0.58f), 1.0f, 0.68f, 22, true, false);
                for (int i = 0; i < 3; i++)
                    Oval(b, new Vector3(0f, -0.06f + i * 0.018f, 0f), Profile(0.158f, 0f, 0.164f, 0.006f, 0.158f, 0.012f), 1.0f, 0.69f, 22);
                b.Torus(new Vector3(0f, 0.565f, 0.005f), 0.06f, 0.014f, 16, 8, 0);
            });
            top.Add(sweater); topObjects[3].Add(sweater.gameObject);

            var neck = Joint(spine, "Neck", new Vector3(0f, 0.56f, 0f));
            skin.Add(Part(neck, "NeckMesh", "Neck_v2", m.Skin, b => Oval(b, Vector3.zero,
                Profile(0.06f, -0.02f, 0.052f, 0.03f, 0.048f, 0.08f, 0.05f, 0.11f), 1f, 1.05f, 14)));

            // ---------------- Head
            var head = Joint(neck, "Head", new Vector3(0f, 0.07f, 0f));
            skin.Add(Part(head, "HeadMesh", "Head_v2", m.Skin, b =>
            {
                b.Ellipsoid(SkullCenter, SkullRadii, 24, 16, 0);
                // Face: brow ridge, cheekbones, jaw and chin give a readable silhouette.
                b.Ellipsoid(new Vector3(0f, 0.138f, 0.072f), new Vector3(0.07f, 0.022f, 0.03f), 16, 8, 0);
                b.Ellipsoid(new Vector3(-0.045f, 0.096f, 0.058f), new Vector3(0.02f, 0.015f, 0.02f), 10, 8, 0);
                b.Ellipsoid(new Vector3(0.045f, 0.096f, 0.058f), new Vector3(0.02f, 0.015f, 0.02f), 10, 8, 0);
                b.Ellipsoid(new Vector3(0f, 0.058f, 0.034f), new Vector3(0.07f, 0.058f, 0.07f), 18, 12, 0);
                b.Ellipsoid(new Vector3(0f, 0.022f, 0.074f), new Vector3(0.03f, 0.024f, 0.024f), 12, 8, 0); // chin
                // Nose: bridge, tip, nostrils.
                b.Box(new Vector3(0f, 0.106f, 0.098f), new Vector3(0.017f, 0.04f, 0.018f), 0, 0.007f, 1f, Quaternion.Euler(-14f, 0f, 0f));
                b.Ellipsoid(new Vector3(0f, 0.083f, 0.107f), new Vector3(0.016f, 0.014f, 0.015f), 10, 8, 0);
                b.Ellipsoid(new Vector3(-0.012f, 0.079f, 0.1f), new Vector3(0.009f, 0.008f, 0.009f), 8, 6, 0);
                b.Ellipsoid(new Vector3(0.012f, 0.079f, 0.1f), new Vector3(0.009f, 0.008f, 0.009f), 8, 6, 0);
                // Upper eyelids.
                b.Ellipsoid(new Vector3(-0.032f, 0.126f, 0.086f), new Vector3(0.016f, 0.007f, 0.01f), 10, 6, 0);
                b.Ellipsoid(new Vector3(0.032f, 0.126f, 0.086f), new Vector3(0.016f, 0.007f, 0.01f), 10, 6, 0);
                // Ears with a rim.
                for (int side = -1; side <= 1; side += 2)
                {
                    b.Ellipsoid(new Vector3(side * 0.085f, 0.1f, -0.004f), new Vector3(0.011f, 0.029f, 0.019f), 10, 8, 0);
                    b.Torus(new Vector3(side * 0.088f, 0.1f, -0.004f), 0.016f, 0.004f, 12, 6, 0, Quaternion.Euler(0f, 0f, 90f));
                }
            }));
            Part(head, "Lips", "Lips", m.Lips, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.056f, 0.094f), new Vector3(0.022f, 0.006f, 0.009f), 12, 6, 0);
                b.Ellipsoid(new Vector3(0f, 0.047f, 0.092f), new Vector3(0.019f, 0.0065f, 0.009f), 12, 6, 0);
            });
            Part(head, "EyeWhites", "EyeWhites", m.EyeWhite, b =>
            {
                b.Ellipsoid(new Vector3(-0.032f, 0.118f, 0.082f), new Vector3(0.014f, 0.0095f, 0.008f), 12, 8, 0);
                b.Ellipsoid(new Vector3(0.032f, 0.118f, 0.082f), new Vector3(0.014f, 0.0095f, 0.008f), 12, 8, 0);
            });
            Part(head, "Irises", "Irises", m.Iris, b =>
            {
                b.Ellipsoid(new Vector3(-0.032f, 0.118f, 0.0895f), new Vector3(0.0065f, 0.0065f, 0.0015f), 12, 6, 0);
                b.Ellipsoid(new Vector3(0.032f, 0.118f, 0.0895f), new Vector3(0.0065f, 0.0065f, 0.0015f), 12, 6, 0);
            });
            hair.Add(Part(head, "Brows", "Brows_v2", m.Hair, b =>
            {
                b.Box(new Vector3(-0.033f, 0.142f, 0.093f), new Vector3(0.032f, 0.0065f, 0.008f), 0, 0.003f, 1f, Quaternion.Euler(0f, 0f, 4f));
                b.Box(new Vector3(0.033f, 0.142f, 0.093f), new Vector3(0.032f, 0.0065f, 0.008f), 0, 0.003f, 1f, Quaternion.Euler(0f, 0f, -4f));
            }));

            // Dynamic hair shell (cut by the haircut system).
            var shellGo = new GameObject("HairShell");
            shellGo.transform.SetParent(head, false);
            shellGo.AddComponent<MeshFilter>();
            var shellRenderer = shellGo.AddComponent<MeshRenderer>();
            shellRenderer.sharedMaterial = m.HairShell;
            var shell = shellGo.AddComponent<Haircut.HairShellRenderer>();
            shell.Configure(SkullCenter, SkullRadii + Vector3.one * 0.002f);

            // Facial hair (hair tint group).
            var facial = new ModularCharacter.Variant[5];
            facial[0] = new ModularCharacter.Variant { name = "None" };
            facial[1] = FacialVariant(head, "Stubble", hair, b => b.Ellipsoid(new Vector3(0f, 0.058f, 0.036f), new Vector3(0.072f, 0.06f, 0.072f), 18, 12, 0));
            facial[2] = FacialVariant(head, "Moustache", hair, b => b.Ellipsoid(new Vector3(0f, 0.066f, 0.1f), new Vector3(0.026f, 0.007f, 0.01f), 12, 6, 0));
            facial[3] = FacialVariant(head, "FullBeard", hair, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.05f, 0.044f), new Vector3(0.078f, 0.068f, 0.076f), 18, 12, 0);
                b.Ellipsoid(new Vector3(0f, 0.018f, 0.075f), new Vector3(0.036f, 0.032f, 0.03f), 12, 8, 0);
                b.Ellipsoid(new Vector3(0f, 0.066f, 0.101f), new Vector3(0.028f, 0.008f, 0.011f), 12, 6, 0);
            });
            facial[4] = FacialVariant(head, "ShortBeard", hair, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.054f, 0.04f), new Vector3(0.074f, 0.062f, 0.074f), 18, 12, 0);
                b.Ellipsoid(new Vector3(0f, 0.066f, 0.1f), new Vector3(0.024f, 0.006f, 0.009f), 12, 6, 0);
            });
            foreach (var v in new[] { facial[1], facial[4] })
                foreach (var go in v.objects) go.transform.localScale = Vector3.one * 1.012f;

            var accessories = new ModularCharacter.Variant[3];
            accessories[0] = new ModularCharacter.Variant { name = "None" };
            var glasses = Part(head, "Glasses", "Glasses_v2", m.MetalDark, b =>
            {
                b.Torus(new Vector3(-0.032f, 0.118f, 0.098f), 0.019f, 0.0022f, 16, 6, 0, Quaternion.Euler(90f, 0f, 0f));
                b.Torus(new Vector3(0.032f, 0.118f, 0.098f), 0.019f, 0.0022f, 16, 6, 0, Quaternion.Euler(90f, 0f, 0f));
                b.Box(new Vector3(0f, 0.121f, 0.1f), new Vector3(0.026f, 0.003f, 0.003f), 0, 0f);
                b.Box(new Vector3(-0.083f, 0.12f, 0.045f), new Vector3(0.003f, 0.003f, 0.1f), 0, 0f);
                b.Box(new Vector3(0.083f, 0.12f, 0.045f), new Vector3(0.003f, 0.003f, 0.1f), 0, 0f);
            });
            accessories[1] = new ModularCharacter.Variant { name = "Glasses", objects = new[] { glasses.gameObject } };
            var cap = Part(head, "Cap", "Cap_v2", m.Cloth, b =>
            {
                b.Lathe(new Vector3(0f, 0.15f, -0.005f), Profile(0.098f, 0f, 0.098f, 0.03f, 0.084f, 0.075f, 0.05f, 0.1f, 0f, 0.108f), 18, 0, true, false, 0.5f);
                b.Box(new Vector3(0f, 0.152f, 0.12f), new Vector3(0.15f, 0.008f, 0.08f), 0, 0.004f, 0.5f, Quaternion.Euler(-6f, 0f, 0f));
            });
            top.Add(cap);
            accessories[2] = new ModularCharacter.Variant { name = "Cap", objects = new[] { cap.gameObject } };

            // ---------------- Arms: shared skin hands, per-variant sleeves.
            Transform upperL = null, upperR = null, foreL = null, foreR = null;
            for (int side = -1; side <= 1; side += 2)
            {
                string s = side < 0 ? "L" : "R";
                var shoulder = Joint(spine, "UpperArm" + s, new Vector3(0.19f * side, 0.46f, 0f));
                shoulder.localRotation = Quaternion.Euler(0f, 0f, 5f * side);
                var elbow = Joint(shoulder, "Forearm" + s, new Vector3(0f, -0.29f, 0f));

                var upperProfile = Profile(0.04f, -0.29f, 0.044f, -0.2f, 0.048f, -0.06f, 0.05f, 0f, 0.044f, 0.035f, 0f, 0.05f);
                var foreProfile = Profile(0.032f, -0.25f, 0.036f, -0.18f, 0.044f, -0.06f, 0.046f, 0.01f);

                // Bare skin parts (T-shirt shows forearms).
                var skinUpper = Part(shoulder, "UpperArmSkin", "UpperArmSkin", m.Skin, b => Oval(b, Vector3.zero, upperProfile, 1f, 1f, 14, true, false));
                var skinFore = Part(elbow, "ForearmSkin", "ForearmSkin", m.Skin, b => Oval(b, Vector3.zero, foreProfile, 1.05f, 0.9f, 14, true, true));
                skin.Add(skinUpper); skin.Add(skinFore);
                topObjects[0].Add(skinFore.gameObject);

                var teeSleeve = Part(shoulder, "SleeveShort", "SleeveShort_v2" + (side < 0 ? "L" : "R"), m.Cloth, b =>
                {
                    Oval(b, Vector3.zero, Profile(0.056f, -0.15f, 0.057f, -0.06f, 0.058f, 0f, 0.052f, 0.04f, 0f, 0.06f), 1f, 1f, 14, true, false);
                    b.Ellipsoid(new Vector3(-0.012f * side, 0.005f, 0f), new Vector3(0.068f, 0.06f, 0.064f), 14, 10, 0);
                });
                top.Add(teeSleeve); topObjects[0].Add(teeSleeve.gameObject);

                for (int variant = 1; variant <= 3; variant++)
                {
                    float puff = variant == 1 ? 0.012f : variant == 2 ? 0.01f : 0.006f;
                    var upperSleeve = Part(shoulder, "SleeveUpper" + variant, "SleeveUpper" + variant + "_v2" + (side < 0 ? "L" : "R"), m.Cloth, b =>
                    {
                        Oval(b, Vector3.zero, Profile(0.045f + puff, -0.3f, 0.048f + puff, -0.2f, 0.053f + puff, -0.06f, 0.056f + puff, 0f, 0.05f + puff, 0.04f, 0f, 0.06f), 1f, 1f, 14, true, false);
                        b.Ellipsoid(new Vector3(-0.012f * side, 0.005f, 0f), new Vector3(0.066f + puff, 0.06f + puff, 0.063f + puff), 14, 10, 0);
                    });
                    var foreSleeve = Part(elbow, "SleeveFore" + variant, "SleeveFore" + variant, m.Cloth, b =>
                    {
                        Oval(b, Vector3.zero, Profile(0.04f + puff, -0.235f, 0.042f + puff, -0.18f, 0.05f + puff, -0.06f, 0.052f + puff, 0.015f), 1.05f, 0.92f, 14, true, true);
                        if (variant != 2) Oval(b, new Vector3(0f, -0.235f, 0f), Profile(0.044f + puff, 0f, 0.046f + puff, 0.01f, 0.044f + puff, 0.02f), 1.05f, 0.92f, 14);
                    });
                    top.Add(upperSleeve); top.Add(foreSleeve);
                    topObjects[variant].Add(upperSleeve.gameObject);
                    topObjects[variant].Add(foreSleeve.gameObject);
                }

                skin.Add(Part(elbow, "Hand", "Hand_v2", m.Skin, b =>
                {
                    b.Box(new Vector3(0f, -0.29f, 0.004f), new Vector3(0.026f, 0.08f, 0.07f), 0, 0.012f);       // palm
                    b.Box(new Vector3(0f, -0.345f, 0.006f), new Vector3(0.022f, 0.05f, 0.064f), 0, 0.01f);      // grouped fingers
                    b.Ellipsoid(new Vector3(0f, -0.285f, 0.044f), new Vector3(0.012f, 0.03f, 0.012f), 8, 6, 0, 1f, Quaternion.Euler(-25f, 0f, 0f)); // thumb
                }));
                if (side < 0) { upperL = shoulder; foreL = elbow; } else { upperR = shoulder; foreR = elbow; }
            }

            // ---------------- Components
            var tops = new ModularCharacter.Variant[4];
            string[] topNames = { "TShirt", "Hoodie", "Jacket", "Sweater" };
            for (int i = 0; i < 4; i++) tops[i] = new ModularCharacter.Variant { name = topNames[i], objects = topObjects[i].ToArray() };

            var modular = root.AddComponent<ModularCharacter>();
            modular.Configure(skin.ToArray(), hair.ToArray(), top.ToArray(), pants.ToArray(), shoes.ToArray(), tops, facial, accessories, shell, body);

            var animator = root.AddComponent<ProceduralCharacterAnimator>();
            animator.Configure(pelvis, spine, head, upperL, upperR, foreL, foreR, thighL, thighR, shinL, shinR, 0.55f);
            return FinishCharacter(root, name, appearance, withMotor, modular, animator);
        }

        /// <summary>
        /// Skinned body exported from Blender (Tools/AssetGen/blender/characters.py). The joint hierarchy is the same
        /// as the procedural body, so <see cref="ProceduralCharacterAnimator"/> drives the bones directly.
        /// </summary>
        private GameObject CreateSkinned(string name, CharacterAppearanceData appearance, bool withMotor, SkinnedCharacterParts parts)
        {
            var root = new GameObject(name);
            var body = Joint(root.transform, "Body", Vector3.zero);
            var pelvis = Joint(body, "Pelvis", new Vector3(0f, 0.98f, 0f));
            var spine = Joint(pelvis, "Spine", new Vector3(0f, 0.08f, 0f));
            var neck = Joint(spine, "Neck", new Vector3(0f, 0.56f, 0f));
            var head = Joint(neck, "Head", new Vector3(0f, 0.07f, 0f));
            var joints = new Dictionary<string, Transform> { { "Pelvis", pelvis }, { "Spine", spine }, { "Neck", neck }, { "Head", head } };
            for (int side = -1; side <= 1; side += 2)
            {
                string s = side < 0 ? "L" : "R";
                var thigh = Joint(pelvis, "Thigh" + s, new Vector3(0.09f * side, -0.06f, 0f));
                var shin = Joint(thigh, "Shin" + s, new Vector3(0f, -0.44f, 0f));
                var upper = Joint(spine, "UpperArm" + s, new Vector3(0.19f * side, 0.46f, 0f));
                upper.localRotation = Quaternion.Euler(0f, 0f, 5f * side);
                var fore = Joint(upper, "Forearm" + s, new Vector3(0f, -0.29f, 0f));
                joints["Thigh" + s] = thigh;
                joints["Shin" + s] = shin;
                joints["UpperArm" + s] = upper;
                joints["Forearm" + s] = fore;
            }

            var bones = new Transform[parts.bones.Length];
            for (int i = 0; i < bones.Length; i++)
            {
                if (!joints.TryGetValue(parts.bones[i], out bones[i]))
                    throw new System.InvalidOperationException("Character export references unknown bone " + parts.bones[i]);
            }
            var bindposes = new Matrix4x4[bones.Length];
            for (int i = 0; i < bones.Length; i++) bindposes[i] = bones[i].worldToLocalMatrix * root.transform.localToWorldMatrix;

            var skin = new List<Renderer>();
            var hair = new List<Renderer>();
            var top = new List<Renderer>();
            var pants = new List<Renderer>();
            var shoes = new List<Renderer>();
            var byName = new Dictionary<string, GameObject>();

            foreach (var part in parts.parts)
            {
                Material material;
                List<Renderer> group = null;
                switch (part.name)
                {
                    case "BodySkin": case "HeadSkin": material = m.Skin; group = skin; break;
                    case "EyeWhites": material = m.EyeWhite; break;
                    case "Irises": material = m.Iris; break;
                    case "Lips": material = m.Lips; break;
                    case "Brows": material = m.Hair; group = hair; break;
                    case "Top_JacketShirt": material = m.FabricCream; break;
                    case "Pants": material = m.Pants; group = pants; break;
                    case "Belt": case "Shoes": material = m.Shoes; group = shoes; break;
                    case "Buckle": material = m.Brass; break;
                    case "Glasses": material = m.MetalDark; break;
                    default:
                        if (part.name.StartsWith("Facial_")) { material = m.Hair; group = hair; }
                        else { material = m.Cloth; group = top; } // Top_* and Cap
                        break;
                }

                var mesh = AssetUtility.SaveMesh(part.BuildMesh(bindposes), "CharSkinned_" + part.name);
                var go = new GameObject(part.name);
                go.transform.SetParent(body, false);
                var renderer = go.AddComponent<SkinnedMeshRenderer>();
                renderer.sharedMesh = mesh;
                renderer.bones = bones;
                renderer.rootBone = pelvis;
                renderer.sharedMaterial = material;
                renderer.quality = SkinQuality.Bone2;
                renderer.updateWhenOffscreen = false;
                // Generous fixed bounds (seated, arms raised) so culling never pops.
                renderer.localBounds = new Bounds(new Vector3(0f, 0.1f, 0.1f), new Vector3(1.4f, 2.2f, 1.4f));
                group?.Add(renderer);
                byName[part.name] = go;
            }

            GameObject[] Objects(params string[] names)
            {
                var list = new List<GameObject>();
                foreach (var n in names)
                    if (byName.TryGetValue(n, out var go)) list.Add(go);
                return list.ToArray();
            }

            var tops = new[]
            {
                new ModularCharacter.Variant { name = "TShirt", objects = Objects("Top_TShirt") },
                new ModularCharacter.Variant { name = "Hoodie", objects = Objects("Top_Hoodie") },
                new ModularCharacter.Variant { name = "Jacket", objects = Objects("Top_Jacket", "Top_JacketShirt") },
                new ModularCharacter.Variant { name = "Sweater", objects = Objects("Top_Sweater") }
            };
            var facial = new[]
            {
                new ModularCharacter.Variant { name = "None" },
                new ModularCharacter.Variant { name = "Stubble", objects = Objects("Facial_Stubble") },
                new ModularCharacter.Variant { name = "Moustache", objects = Objects("Facial_Moustache") },
                new ModularCharacter.Variant { name = "FullBeard", objects = Objects("Facial_FullBeard") },
                new ModularCharacter.Variant { name = "ShortBeard", objects = Objects("Facial_ShortBeard") }
            };
            var accessories = new[]
            {
                new ModularCharacter.Variant { name = "None" },
                new ModularCharacter.Variant { name = "Glasses", objects = Objects("Glasses") },
                new ModularCharacter.Variant { name = "Cap", objects = Objects("Cap") }
            };

            // Dynamic hair shell (cut by the haircut system), fitted to the exported cranium.
            var shellGo = new GameObject("HairShell");
            shellGo.transform.SetParent(head, false);
            shellGo.AddComponent<MeshFilter>();
            var shellRenderer = shellGo.AddComponent<MeshRenderer>();
            shellRenderer.sharedMaterial = m.HairShell;
            var shell = shellGo.AddComponent<Haircut.HairShellRenderer>();
            shell.Configure(parts.SkullCenter, parts.SkullRadii + Vector3.one * 0.002f);

            var modular = root.AddComponent<ModularCharacter>();
            modular.Configure(skin.ToArray(), hair.ToArray(), top.ToArray(), pants.ToArray(), shoes.ToArray(), tops, facial, accessories, shell, body);

            var animator = root.AddComponent<ProceduralCharacterAnimator>();
            animator.Configure(pelvis, spine, head, joints["UpperArmL"], joints["UpperArmR"], joints["ForearmL"], joints["ForearmR"],
                joints["ThighL"], joints["ThighR"], joints["ShinL"], joints["ShinR"], 0.55f);
            return FinishCharacter(root, name, appearance, withMotor, modular, animator);
        }

        private static GameObject FinishCharacter(GameObject root, string name, CharacterAppearanceData appearance, bool withMotor,
            ModularCharacter modular, ProceduralCharacterAnimator animator)
        {
            if (withMotor)
            {
                var motor = root.AddComponent<NpcMotor>();
                motor.SetAnimator(animator);
            }

            int seed = name.GetHashCode();
            modular.Apply(appearance, seed);
            var asset = ScriptableObject.CreateInstance<CharacterAppearance>();
            asset.Configure(appearance);
            asset = AssetUtility.SaveAsset(asset, GeneratorPaths.ScriptableObjects + "/Characters/" + name + ".asset");
            modular.SetDefaultAppearance(asset, seed);

            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
            {
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                r.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.BlendProbes;
            }
            return root;
        }

        private ModularCharacter.Variant FacialVariant(Transform head, string name, List<Renderer> hairGroup, System.Action<MeshBuilder> build)
        {
            var renderer = Part(head, "Facial_" + name, "Facial_" + name + "_v2", m.Hair, build);
            hairGroup.Add(renderer);
            return new ModularCharacter.Variant { name = name, objects = new[] { renderer.gameObject } };
        }

        /// <summary>First-person arms (sleeve + hand) used by <see cref="Player.FirstPersonHands"/>.</summary>
        public GameObject CreateFirstPersonArm(Transform parent, string name, bool right, Color sleeveColor, Color skinColor)
        {
            var arm = new GameObject(name);
            arm.transform.SetParent(parent, false);
            var block = new MaterialPropertyBlock();

            var sculpted = SkinnedCharacterParts.Load(SkinnedCharacterParts.FirstPersonRelativePath);
            if (sculpted != null)
            {
                // Blender-sculpted forearm, hand and sleeve (same anatomy as the customers).
                foreach (var part in sculpted.parts)
                {
                    bool isSleeve = part.name == "FP_Sleeve";
                    var go = new GameObject(isSleeve ? "Sleeve" : "Hand");
                    go.transform.SetParent(arm.transform, false);
                    go.AddComponent<MeshFilter>().sharedMesh = AssetUtility.SaveMesh(part.BuildMesh(null), part.name);
                    var r = go.AddComponent<MeshRenderer>();
                    r.sharedMaterial = isSleeve ? m.Cloth : m.Skin;
                    block.SetColor("_BaseColor", isSleeve ? sleeveColor : skinColor);
                    r.SetPropertyBlock(block);
                    r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }
                if (!right) arm.transform.localScale = new Vector3(-1f, 1f, 1f);
                return arm;
            }

            var sleeve = Part(arm.transform, "Sleeve", "FP_Sleeve", m.Cloth, b => b.Frustum(new Vector3(0f, 0f, -0.2f), 0.05f, 0.044f, 0.4f, 14, 0, 0.5f, Quaternion.Euler(90f, 0f, 0f)));
            block.SetColor("_BaseColor", sleeveColor);
            sleeve.SetPropertyBlock(block);

            var hand = Part(arm.transform, "Hand", "FP_Hand", m.Skin, b =>
            {
                b.Frustum(new Vector3(0f, 0f, 0.02f), 0.036f, 0.034f, 0.06f, 12, 0, 0.5f, Quaternion.Euler(90f, 0f, 0f)); // wrist
                b.Box(new Vector3(0f, 0f, 0.085f), new Vector3(0.075f, 0.03f, 0.09f), 0, 0.012f); // palm
                for (int i = 0; i < 4; i++)
                    b.Box(new Vector3(-0.027f + i * 0.018f, -0.006f, 0.145f), new Vector3(0.015f, 0.016f, 0.05f), 0, 0.006f, 1f, Quaternion.Euler(28f, 0f, 0f));
                b.Box(new Vector3(0.045f, -0.004f, 0.09f), new Vector3(0.016f, 0.018f, 0.05f), 0, 0.006f, 1f, Quaternion.Euler(0f, -35f, 0f)); // thumb
            });
            block.SetColor("_BaseColor", skinColor);
            hand.SetPropertyBlock(block);

            if (!right) arm.transform.localScale = new Vector3(-1f, 1f, 1f);
            foreach (var r in arm.GetComponentsInChildren<Renderer>(true))
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return arm;
        }
    }
}
