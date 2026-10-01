using System;
using UnityEngine;

namespace BarberSimulator.Characters
{
    /// <summary>
    /// Applies <see cref="CharacterAppearanceData"/> to a modular body: toggles variant objects and tints part
    /// groups through MaterialPropertyBlocks so all characters share the same few materials.
    /// </summary>
    public sealed class ModularCharacter : MonoBehaviour
    {
        [Serializable]
        public sealed class PartGroup
        {
            public Renderer[] renderers = Array.Empty<Renderer>();
        }

        [SerializeField] private PartGroup skin = new PartGroup();
        [SerializeField] private PartGroup hair = new PartGroup();
        [SerializeField] private PartGroup top = new PartGroup();
        [SerializeField] private PartGroup pants = new PartGroup();
        [SerializeField] private PartGroup shoes = new PartGroup();
        [Tooltip("Index = HairStyle.")]
        [SerializeField] private GameObject[] hairVariants = Array.Empty<GameObject>();
        [Tooltip("Index = FacialHairStyle.")]
        [SerializeField] private GameObject[] facialHairVariants = Array.Empty<GameObject>();
        [Tooltip("Index = topStyle.")]
        [SerializeField] private GameObject[] topVariants = Array.Empty<GameObject>();
        [Tooltip("Index = CharacterAccessory.")]
        [SerializeField] private GameObject[] accessoryVariants = Array.Empty<GameObject>();
        [SerializeField] private Transform bodyRoot;
        [SerializeField] private CharacterAppearance defaultAppearance;

        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private MaterialPropertyBlock _block;

        public CharacterAppearanceData Current { get; private set; }

        public void Configure(Renderer[] skinRenderers, Renderer[] hairRenderers, Renderer[] topRenderers, Renderer[] pantsRenderers,
            Renderer[] shoeRenderers, GameObject[] hairs, GameObject[] facialHairs, GameObject[] tops, GameObject[] accessories, Transform root)
        {
            skin.renderers = skinRenderers;
            hair.renderers = hairRenderers;
            top.renderers = topRenderers;
            pants.renderers = pantsRenderers;
            shoes.renderers = shoeRenderers;
            hairVariants = hairs;
            facialHairVariants = facialHairs;
            topVariants = tops;
            accessoryVariants = accessories;
            bodyRoot = root;
        }

        public void SetDefaultAppearance(CharacterAppearance appearance)
        {
            defaultAppearance = appearance;
        }

        private void Awake()
        {
            if (defaultAppearance != null) Apply(defaultAppearance.Data);
        }

        public void Apply(CharacterAppearanceData data)
        {
            Current = data;
            Toggle(hairVariants, (int)data.hairStyle);
            Toggle(facialHairVariants, (int)data.facialHair);
            Toggle(topVariants, data.topStyle);
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
        }

        private static void Toggle(GameObject[] variants, int index)
        {
            for (int i = 0; i < variants.Length; i++)
                if (variants[i] != null) variants[i].SetActive(i == index);
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
