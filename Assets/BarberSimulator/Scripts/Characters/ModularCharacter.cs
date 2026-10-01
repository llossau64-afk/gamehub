using System;
using BarberSimulator.Haircut;
using UnityEngine;

namespace BarberSimulator.Characters
{
    /// <summary>
    /// Applies <see cref="CharacterAppearanceData"/> to a modular body: toggles variant objects, tints part groups
    /// through MaterialPropertyBlocks (all characters share a handful of materials) and grows the dynamic hair
    /// that the haircut system later cuts.
    /// </summary>
    public sealed class ModularCharacter : MonoBehaviour
    {
        [Serializable]
        public sealed class PartGroup
        {
            public Renderer[] renderers = Array.Empty<Renderer>();
        }

        /// <summary>One selectable variant made of several objects (e.g. a hoodie = torso + both sleeves + hood).</summary>
        [Serializable]
        public sealed class Variant
        {
            public string name;
            public GameObject[] objects = Array.Empty<GameObject>();
        }

        [SerializeField] private PartGroup skin = new PartGroup();
        [SerializeField] private PartGroup hair = new PartGroup();
        [SerializeField] private PartGroup top = new PartGroup();
        [SerializeField] private PartGroup pants = new PartGroup();
        [SerializeField] private PartGroup shoes = new PartGroup();
        [Tooltip("Index = topStyle (T-shirt, hoodie, jacket, sweater).")]
        [SerializeField] private Variant[] topVariants = Array.Empty<Variant>();
        [Tooltip("Index = FacialHairStyle.")]
        [SerializeField] private Variant[] facialHairVariants = Array.Empty<Variant>();
        [Tooltip("Index = CharacterAccessory.")]
        [SerializeField] private Variant[] accessoryVariants = Array.Empty<Variant>();
        [SerializeField] private HairShellRenderer hairShell;
        [SerializeField] private Transform bodyRoot;
        [SerializeField] private CharacterAppearance defaultAppearance;
        [SerializeField] private int hairSeed;

        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private MaterialPropertyBlock _block;

        public CharacterAppearanceData Current { get; private set; }
        public HairShellRenderer HairShell => hairShell;
        public HairGrid Hair => hairShell != null ? hairShell.Grid : null;

        public void Configure(Renderer[] skinRenderers, Renderer[] hairRenderers, Renderer[] topRenderers, Renderer[] pantsRenderers,
            Renderer[] shoeRenderers, Variant[] tops, Variant[] facialHairs, Variant[] accessories, HairShellRenderer shell, Transform root)
        {
            skin.renderers = skinRenderers;
            hair.renderers = hairRenderers;
            top.renderers = topRenderers;
            pants.renderers = pantsRenderers;
            shoes.renderers = shoeRenderers;
            topVariants = tops;
            facialHairVariants = facialHairs;
            accessoryVariants = accessories;
            hairShell = shell;
            bodyRoot = root;
        }

        public void SetDefaultAppearance(CharacterAppearance appearance, int seed)
        {
            defaultAppearance = appearance;
            hairSeed = seed;
        }

        private void Awake()
        {
            if (defaultAppearance != null) Apply(defaultAppearance.Data, hairSeed);
        }

        /// <summary>Applies a look and grows a fresh head of hair for it.</summary>
        public void Apply(CharacterAppearanceData data, int seed)
        {
            Current = data;
            Toggle(topVariants, data.topStyle);
            Toggle(facialHairVariants, (int)data.facialHair);
            Toggle(accessoryVariants, (int)data.accessory);

            Tint(skin, data.skinTone);
            Tint(hair, data.hairColor);
            Tint(top, data.topColor);
            Tint(pants, data.pantsColor);
            Tint(shoes, data.shoeColor);

            if (bodyRoot != null)
            {
                float h = data.heightScale <= 0f ? 1f : data.heightScale;
                float b = data.buildScale <= 0f ? 1f : data.buildScale;
                bodyRoot.localScale = new Vector3(b * h, h, b * h);
            }

            if (hairShell != null)
            {
                var grid = new HairGrid();
                grid.Initialize(HairPresets.For(data.hairStyle, data.hairLengthScale <= 0f ? 1f : data.hairLengthScale), seed);
                hairShell.Bind(grid, data.hairColor, data.skinTone);
                // Caps hide the hair entirely.
                hairShell.gameObject.SetActive(data.accessory != CharacterAccessory.Cap);
            }
        }

        public void Apply(CharacterAppearanceData data) => Apply(data, hairSeed);

        private static void Toggle(Variant[] variants, int index)
        {
            for (int i = 0; i < variants.Length; i++)
            {
                if (variants[i] == null) continue;
                foreach (var go in variants[i].objects)
                    if (go != null) go.SetActive(i == index);
            }
            // Objects shared by several variants stay on if any active variant uses them.
            if (index >= 0 && index < variants.Length && variants[index] != null)
                foreach (var go in variants[index].objects)
                    if (go != null) go.SetActive(true);
        }

        private void Tint(PartGroup group, Color color)
        {
            if (_block == null) _block = new MaterialPropertyBlock();
            _block.SetColor(BaseColorId, color);
            foreach (var r in group.renderers)
                if (r != null) r.SetPropertyBlock(_block);
        }
    }
}
