using System.Collections.Generic;
using BarberSimulator.Art;
using BarberSimulator.Characters;
using BarberSimulator.NPC;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Builds the modular placeholder humanoid: jointed body parts (no skinning, so no T-pose risk), variant slots
    /// for hair / facial hair / tops / accessories and a <see cref="ModularCharacter"/> + procedural animator.
    /// Replace with a rigged humanoid later; the appearance data and animator intents stay the same.
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

        public GameObject Create(string name, CharacterAppearanceData appearance, bool withMotor)
        {
            var root = new GameObject(name);
            var body = Joint(root.transform, "Body", Vector3.zero);

            var skin = new List<Renderer>();
            var hair = new List<Renderer>();
            var top = new List<Renderer>();
            var pants = new List<Renderer>();
            var shoes = new List<Renderer>();

            // ---------------- Pelvis & legs
            var pelvis = Joint(body, "Pelvis", new Vector3(0f, 0.98f, 0f));
            pants.Add(Part(pelvis, "Hips", "Hips", m.Pants, b => b.Box(new Vector3(0f, -0.02f, 0f), new Vector3(0.34f, 0.2f, 0.22f), 0, 0.07f, 0.5f, null, 3)));
            var belt = Part(pelvis, "Belt", "Belt", m.Shoes, b => b.Box(new Vector3(0f, 0.075f, 0f), new Vector3(0.345f, 0.04f, 0.225f), 0, 0.015f));
            shoes.Add(belt);

            Transform thighL = null, thighR = null, shinL = null, shinR = null;
            for (int side = -1; side <= 1; side += 2)
            {
                string s = side < 0 ? "L" : "R";
                var hip = Joint(pelvis, "Thigh" + s, new Vector3(0.095f * side, -0.06f, 0f));
                pants.Add(Part(hip, "ThighMesh", "Thigh", m.Pants, b => b.Lathe(Vector3.zero, new[]
                {
                    new Vector2(0.06f, -0.46f), new Vector2(0.068f, -0.3f), new Vector2(0.082f, -0.08f), new Vector2(0.078f, 0.02f)
                }, 14, 0, false, true, 0.5f)));
                var knee = Joint(hip, "Shin" + s, new Vector3(0f, -0.44f, 0f));
                pants.Add(Part(knee, "ShinMesh", "Shin", m.Pants, b => b.Lathe(Vector3.zero, new[]
                {
                    new Vector2(0.058f, -0.42f), new Vector2(0.052f, -0.3f), new Vector2(0.06f, -0.08f), new Vector2(0.062f, 0.02f)
                }, 14, 0, true, true, 0.5f)));
                shoes.Add(Part(knee, "Shoe", "Shoe", m.Shoes, b =>
                {
                    b.Box(new Vector3(0f, -0.455f, 0.045f), new Vector3(0.1f, 0.075f, 0.27f), 0, 0.03f, 0.3f, null, 3);
                    b.Box(new Vector3(0f, -0.49f, 0.045f), new Vector3(0.104f, 0.014f, 0.275f), 0, 0.005f);
                }));
                if (side < 0) { thighL = hip; shinL = knee; } else { thighR = hip; shinR = knee; }
            }

            // ---------------- Torso
            var spine = Joint(pelvis, "Spine", new Vector3(0f, 0.08f, 0f));
            var topVariants = new GameObject[2];
            topVariants[0] = new GameObject("Top_Shirt");
            topVariants[0].transform.SetParent(spine, false);
            top.Add(Part(topVariants[0].transform, "Torso", "Torso_Shirt", m.Cloth, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.27f, 0f), new Vector3(0.2f, 0.3f, 0.125f), 20, 14, 0, 0.5f);
                b.Box(new Vector3(0f, 0.035f, 0f), new Vector3(0.33f, 0.1f, 0.21f), 0, 0.05f, 0.5f);
                b.Torus(new Vector3(0f, 0.53f, 0.005f), 0.062f, 0.014f, 16, 8, 0);
            }));
            topVariants[1] = new GameObject("Top_Jacket");
            topVariants[1].transform.SetParent(spine, false);
            top.Add(Part(topVariants[1].transform, "Torso", "Torso_Jacket", m.Cloth, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.27f, 0f), new Vector3(0.212f, 0.31f, 0.135f), 20, 14, 0, 0.5f);
                b.Box(new Vector3(0f, 0.0f, 0f), new Vector3(0.36f, 0.16f, 0.23f), 0, 0.06f, 0.5f);
                // Lapels and buttons hint.
                b.Box(new Vector3(-0.055f, 0.38f, 0.118f), new Vector3(0.05f, 0.2f, 0.02f), 0, 0.008f, 0.5f, Quaternion.Euler(0f, 0f, -14f));
                b.Box(new Vector3(0.055f, 0.38f, 0.118f), new Vector3(0.05f, 0.2f, 0.02f), 0, 0.008f, 0.5f, Quaternion.Euler(0f, 0f, 14f));
                b.Torus(new Vector3(0f, 0.53f, 0.005f), 0.066f, 0.018f, 16, 8, 0);
            }));

            var neck = Joint(spine, "Neck", new Vector3(0f, 0.56f, 0f));
            skin.Add(Part(neck, "NeckMesh", "Neck", m.Skin, b => b.Cylinder(new Vector3(0f, 0.03f, 0f), 0.05f, 0.1f, 12, 0)));

            // ---------------- Head
            var head = Joint(neck, "Head", new Vector3(0f, 0.07f, 0f));
            skin.Add(Part(head, "HeadMesh", "Head", m.Skin, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.11f, 0.005f), new Vector3(0.088f, 0.115f, 0.104f), 20, 14, 0);
                b.Ellipsoid(new Vector3(0f, 0.045f, 0.035f), new Vector3(0.072f, 0.06f, 0.072f), 16, 10, 0); // jaw
                b.Ellipsoid(new Vector3(0f, 0.1f, 0.105f), new Vector3(0.016f, 0.026f, 0.022f), 10, 8, 0); // nose
                b.Ellipsoid(new Vector3(-0.089f, 0.105f, 0.0f), new Vector3(0.012f, 0.026f, 0.018f), 8, 6, 0); // ears
                b.Ellipsoid(new Vector3(0.089f, 0.105f, 0.0f), new Vector3(0.012f, 0.026f, 0.018f), 8, 6, 0);
            }));
            Part(head, "Eyes", "Eyes", m.Eyes, b =>
            {
                b.Ellipsoid(new Vector3(-0.032f, 0.125f, 0.093f), new Vector3(0.011f, 0.009f, 0.006f), 10, 6, 0);
                b.Ellipsoid(new Vector3(0.032f, 0.125f, 0.093f), new Vector3(0.011f, 0.009f, 0.006f), 10, 6, 0);
            });
            hair.Add(Part(head, "Brows", "Brows", m.Hair, b =>
            {
                b.Box(new Vector3(-0.033f, 0.148f, 0.096f), new Vector3(0.034f, 0.008f, 0.01f), 0, 0.003f, 1f, Quaternion.Euler(0f, 0f, -6f));
                b.Box(new Vector3(0.033f, 0.148f, 0.096f), new Vector3(0.034f, 0.008f, 0.01f), 0, 0.003f, 1f, Quaternion.Euler(0f, 0f, 6f));
            }));

            var hairVariants = new GameObject[6];
            hairVariants[0] = new GameObject("Hair_Bald");
            hairVariants[0].transform.SetParent(head, false);
            hairVariants[1] = HairVariant(head, "Hair_Short", hair, b => b.Ellipsoid(new Vector3(0f, 0.138f, -0.004f), new Vector3(0.093f, 0.098f, 0.108f), 18, 12, 0));
            hairVariants[2] = HairVariant(head, "Hair_SidePart", hair, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.142f, -0.004f), new Vector3(0.095f, 0.1f, 0.11f), 18, 12, 0);
                b.Ellipsoid(new Vector3(0.02f, 0.2f, 0.03f), new Vector3(0.08f, 0.04f, 0.085f), 16, 8, 0, 1f, Quaternion.Euler(0f, 0f, -10f));
            });
            hairVariants[3] = HairVariant(head, "Hair_Curly", hair, b =>
            {
                var rng = new System.Random(7);
                for (int i = 0; i < 26; i++)
                {
                    float a = (float)rng.NextDouble() * Mathf.PI * 2f;
                    float y = 0.13f + (float)rng.NextDouble() * 0.1f;
                    float r = Mathf.Lerp(0.085f, 0.03f, (y - 0.13f) / 0.1f);
                    var c = new Vector3(Mathf.Cos(a) * r, y, Mathf.Sin(a) * r * 1.1f - 0.01f);
                    if (c.z > 0.07f && y < 0.17f) continue; // keep the forehead free
                    b.Ellipsoid(c, Vector3.one * 0.032f, 8, 6, 0);
                }
            });
            hairVariants[4] = HairVariant(head, "Hair_Long", hair, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.14f, -0.006f), new Vector3(0.096f, 0.1f, 0.11f), 18, 12, 0);
                b.Ellipsoid(new Vector3(0f, 0.04f, -0.06f), new Vector3(0.09f, 0.12f, 0.06f), 16, 10, 0);
            });
            hairVariants[5] = HairVariant(head, "Hair_Pompadour", hair, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.135f, -0.01f), new Vector3(0.092f, 0.096f, 0.104f), 18, 12, 0);
                b.Ellipsoid(new Vector3(0f, 0.21f, 0.035f), new Vector3(0.075f, 0.05f, 0.08f), 16, 10, 0, 1f, Quaternion.Euler(-18f, 0f, 0f));
            });

            var facial = new GameObject[4];
            facial[0] = new GameObject("Facial_None");
            facial[0].transform.SetParent(head, false);
            facial[1] = HairVariant(head, "Facial_Stubble", hair, b => b.Ellipsoid(new Vector3(0f, 0.045f, 0.037f), new Vector3(0.074f, 0.062f, 0.074f), 16, 10, 0));
            facial[2] = HairVariant(head, "Facial_Moustache", hair, b => b.Ellipsoid(new Vector3(0f, 0.072f, 0.104f), new Vector3(0.034f, 0.011f, 0.014f), 12, 6, 0));
            facial[3] = HairVariant(head, "Facial_Beard", hair, b =>
            {
                b.Ellipsoid(new Vector3(0f, 0.038f, 0.045f), new Vector3(0.08f, 0.07f, 0.075f), 16, 10, 0);
                b.Ellipsoid(new Vector3(0f, 0.072f, 0.104f), new Vector3(0.036f, 0.012f, 0.015f), 12, 6, 0);
            });
            // Stubble is a darker shell drawn just above the skin; scale it slightly so it never z-fights.
            facial[1].transform.localScale = Vector3.one * 1.01f;

            var accessories = new GameObject[3];
            accessories[0] = new GameObject("Accessory_None");
            accessories[0].transform.SetParent(head, false);
            accessories[1] = new GameObject("Accessory_Glasses");
            accessories[1].transform.SetParent(head, false);
            Part(accessories[1].transform, "Glasses", "Glasses", m.MetalDark, b =>
            {
                b.Torus(new Vector3(-0.034f, 0.122f, 0.104f), 0.022f, 0.0025f, 16, 6, 0, Quaternion.Euler(90f, 0f, 0f));
                b.Torus(new Vector3(0.034f, 0.122f, 0.104f), 0.022f, 0.0025f, 16, 6, 0, Quaternion.Euler(90f, 0f, 0f));
                b.Box(new Vector3(0f, 0.124f, 0.106f), new Vector3(0.024f, 0.004f, 0.004f), 0, 0f);
                b.Box(new Vector3(-0.085f, 0.124f, 0.05f), new Vector3(0.004f, 0.004f, 0.1f), 0, 0f);
                b.Box(new Vector3(0.085f, 0.124f, 0.05f), new Vector3(0.004f, 0.004f, 0.1f), 0, 0f);
            });
            accessories[2] = new GameObject("Accessory_Cap");
            accessories[2].transform.SetParent(head, false);
            top.Add(Part(accessories[2].transform, "Cap", "Cap", m.Cloth, b =>
            {
                b.Lathe(new Vector3(0f, 0.15f, -0.005f), new[]
                {
                    new Vector2(0.1f, 0f), new Vector2(0.1f, 0.03f), new Vector2(0.085f, 0.075f), new Vector2(0.05f, 0.1f), new Vector2(0f, 0.108f)
                }, 18, 0, true, false, 0.5f);
                b.Box(new Vector3(0f, 0.152f, 0.12f), new Vector3(0.15f, 0.008f, 0.08f), 0, 0.004f, 0.5f, Quaternion.Euler(-6f, 0f, 0f));
            }));

            // ---------------- Arms
            Transform upperL = null, upperR = null, foreL = null, foreR = null;
            for (int side = -1; side <= 1; side += 2)
            {
                string s = side < 0 ? "L" : "R";
                var shoulder = Joint(spine, "UpperArm" + s, new Vector3(0.215f * side, 0.47f, 0f));
                shoulder.localRotation = Quaternion.Euler(0f, 0f, 4f * side);
                top.Add(Part(shoulder, "UpperArmMesh", "UpperArm", m.Cloth, b =>
                {
                    b.Ellipsoid(Vector3.zero, new Vector3(0.062f, 0.06f, 0.062f), 12, 8, 0);
                    b.Frustum(new Vector3(0f, -0.15f, 0f), 0.048f, 0.056f, 0.3f, 14, 0, 0.5f);
                }));
                var elbow = Joint(shoulder, "Forearm" + s, new Vector3(0f, -0.3f, 0f));
                top.Add(Part(elbow, "ForearmMesh", "Forearm", m.Cloth, b => b.Frustum(new Vector3(0f, -0.12f, 0f), 0.04f, 0.047f, 0.25f, 14, 0, 0.5f)));
                skin.Add(Part(elbow, "Hand", "Hand", m.Skin, b =>
                {
                    b.Ellipsoid(new Vector3(0f, -0.29f, 0.005f), new Vector3(0.028f, 0.05f, 0.042f), 12, 8, 0);
                    b.Ellipsoid(new Vector3(0f, -0.275f, 0.045f), new Vector3(0.014f, 0.03f, 0.014f), 8, 6, 0); // thumb
                }));
                if (side < 0) { upperL = shoulder; foreL = elbow; } else { upperR = shoulder; foreR = elbow; }
            }

            // ---------------- Components
            var modular = root.AddComponent<ModularCharacter>();
            modular.Configure(skin.ToArray(), hair.ToArray(), top.ToArray(), pants.ToArray(), shoes.ToArray(), hairVariants, facial, topVariants, accessories, body);

            var animator = root.AddComponent<ProceduralCharacterAnimator>();
            animator.Configure(pelvis, spine, head, upperL, upperR, foreL, foreR, thighL, thighR, shinL, shinR, 0.55f);

            if (withMotor)
            {
                var motor = root.AddComponent<NpcMotor>();
                motor.SetAnimator(animator);
            }

            // Apply now so the scene shows the right look in edit mode too.
            modular.Apply(appearance);
            var asset = ScriptableObject.CreateInstance<CharacterAppearance>();
            asset.Configure(appearance);
            asset = AssetUtility.SaveAsset(asset, GeneratorPaths.ScriptableObjects + "/Characters/" + name + ".asset");
            modular.SetDefaultAppearance(asset);

            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
            {
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                r.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.BlendProbes;
            }
            return root;
        }

        private GameObject HairVariant(Transform head, string name, List<Renderer> hairGroup, System.Action<MeshBuilder> build)
        {
            var go = new GameObject(name);
            go.transform.SetParent(head, false);
            hairGroup.Add(Part(go.transform, name + "Mesh", name, m.Hair, build));
            return go;
        }

        /// <summary>First-person arms (sleeve + hand) used by <see cref="Player.FirstPersonHands"/>.</summary>
        public GameObject CreateFirstPersonArm(Transform parent, string name, bool right, Color sleeveColor, Color skinColor)
        {
            var arm = new GameObject(name);
            arm.transform.SetParent(parent, false);
            var block = new MaterialPropertyBlock();

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
