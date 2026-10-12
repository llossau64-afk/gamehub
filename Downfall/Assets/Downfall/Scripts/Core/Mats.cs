// Runtime access to the project's materials, textures and model prefabs.
//
//   Mats.Get("chrome")                 shared material (Resources/Materials/chrome.mat)
//   Mats.Get("Models/bark_pine")       material of a Blender GLB material (Resources/Materials/Models/…)
//   Mats.Clone("headlight")            private copy (for per-car tinting / emissive changes)
//   Mats.Tex("Generated/tire_offroad") texture by Art/Textures-relative key (via Resources/TexRegistry)
//   Mats.Prefab("pine0_lod0")          model prefab by its JS asset name (Resources/Prefabs/<Cat>/<name>)
//   Mats.Car("dusty")                  car body prefab (Resources/Prefabs/Cars/car_dusty)
//
// The .mat assets are written by the editor step (Downfall.EditorTools.MaterialBuilder) from the
// same MatDefs table used here, so if that step was skipped Get() builds the material at runtime
// (textures then come from the registry when it exists, otherwise the material is colour only).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Downfall
{
    public enum MatKind { Lit, Unlit, Particle }
    public enum MatSurface { Opaque, Cutout, Transparent, Additive }

    /// <summary>One material description. Colours are sRGB like three.js hex colours.</summary>
    public sealed class MatDef
    {
        public string name;
        public MatKind kind = MatKind.Lit;
        public MatSurface surface = MatSurface.Opaque;
        public Color color = Color.white;
        public string tex, normal, metalMap, emissionTex;   // TexRegistry keys ("Generated/rock")
        public float metallic, smoothness = 0.5f, normalScale = 1f, cutoff = 0.5f;
        public Color emission = Color.black;                 // sRGB colour, already multiplied by intensity
        public float emissionIntensity = 0f;
        public bool twoSided, vertexColors, noShadows;
        public Vector2 tiling = Vector2.one;
        public string js;                                    // where it comes from in the JS game

        public MatDef(string name, Color color, float roughness = 0.5f, float metalness = 0f)
        {
            this.name = name; this.color = color; smoothness = 1f - roughness; metallic = metalness;
        }

        public static Color Hex(int rgb, float a = 1f) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, a);

        public MatDef Tex(string key) { tex = key; return this; }
        public MatDef Normal(string key, float scale = 1f) { normal = key; normalScale = scale; return this; }
        public MatDef MetalMap(string key) { metalMap = key; return this; }
        public MatDef Emit(int rgb, float intensity, string map = null) { emission = Hex(rgb); emissionIntensity = intensity; emissionTex = map; return this; }
        public MatDef Emit(Color c, float intensity, string map = null) { emission = c; emissionIntensity = intensity; emissionTex = map; return this; }
        public MatDef Cut(float c = 0.5f) { surface = MatSurface.Cutout; cutoff = c; return this; }
        public MatDef Transparent(float alpha = 1f) { surface = MatSurface.Transparent; color.a = alpha; return this; }
        public MatDef Additive() { surface = MatSurface.Additive; return this; }
        public MatDef TwoSided() { twoSided = true; return this; }
        public MatDef VC() { vertexColors = true; return this; }
        public MatDef NoShadows() { noShadows = true; return this; }
        public MatDef Unlit() { kind = MatKind.Unlit; return this; }
        public MatDef Particle() { kind = MatKind.Particle; return this; }
        public MatDef Tile(float u, float v) { tiling = new Vector2(u, v); return this; }
        public MatDef From(string jsRef) { js = jsRef; return this; }
    }

    /// <summary>All material descriptions: the JS shared materials (MatDefs.cs) and the Blender GLB
    /// materials (MatDefs.Models.cs, generated).</summary>
    public static partial class MatDefs
    {
        static List<MatDef> list;
        static Dictionary<string, MatDef> map;

        public static IReadOnlyList<MatDef> All { get { Init(); return list; } }
        public static MatDef Find(string name) { Init(); return map.TryGetValue(name, out var d) ? d : null; }

        static void Init()
        {
            if (list != null) return;
            list = new List<MatDef>();
            AddJs(list);
            AddModels(list);
            map = new Dictionary<string, MatDef>();
            foreach (var d in list) map[d.name] = d;
        }

        static partial void AddModels(List<MatDef> l);
    }

    public static class Mats
    {
        public const string MaterialDir = "Materials/";
        public const string PrefabDir = "Prefabs/";
        public const string RegistryPath = "TexRegistry";

        static readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();
        static Dictionary<string, Texture2D> texMap;

        /// <summary>Shared material by name. Never null: unknown names give a magenta-free grey Lit material.</summary>
        public static Material Get(string name)
        {
            if (cache.TryGetValue(name, out var m) && m) return m;
            m = Resources.Load<Material>(MaterialDir + name);
            if (!m)
            {
                var d = MatDefs.Find(name) ?? new MatDef(name, new Color(0.6f, 0.6f, 0.6f), 0.8f);
                m = Create(d);
            }
            cache[name] = m;
            return m;
        }

        /// <summary>A private copy of a shared material (caller owns it).</summary>
        public static Material Clone(string name) { var m = new Material(Get(name)); m.name = name + " (copy)"; return m; }

        /// <summary>Texture by Art/Textures-relative key without extension, e.g. "Generated/sign_km_3", "Terrain/grass", "nature/leaves_oak".</summary>
        public static Texture2D Tex(string key)
        {
            if (string.IsNullOrEmpty(key)) return null;
            if (texMap == null)
            {
                texMap = new Dictionary<string, Texture2D>();
                var reg = Resources.Load<TexRegistry>(RegistryPath);
                if (reg != null && reg.keys != null)
                    for (int i = 0; i < reg.keys.Length && i < reg.textures.Length; i++)
                        if (reg.textures[i]) texMap[reg.keys[i]] = reg.textures[i];
            }
            return texMap.TryGetValue(key, out var t) ? t : null;
        }

        /// <summary>Model prefab by its JS asset name (assetParts / cloneAsset / carAsset names).</summary>
        public static GameObject Prefab(string jsName)
        {
            var p = ArtIndex.PrefabPath(jsName);
            return p == null ? null : Resources.Load<GameObject>(p);
        }

        public static GameObject Car(string id) => Resources.Load<GameObject>(PrefabDir + "Cars/car_" + id);

        public static GameObject Spawn(string jsName, Transform parent = null)
        {
            var p = Prefab(jsName);
            if (!p) return null;
            var o = UnityEngine.Object.Instantiate(p, parent, false);
            o.name = jsName;
            return o;
        }

        // ------------------------------------------------------------------ material construction

        public static bool Urp => GraphicsSettings.currentRenderPipeline != null;

        public static Shader FindShader(MatKind kind, MatSurface surface = MatSurface.Opaque)
        {
            Shader s = null;
            switch (kind)
            {
                case MatKind.Lit: s = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"); break;
                case MatKind.Unlit:
                    s = Shader.Find("Universal Render Pipeline/Unlit")
                        ?? Shader.Find(surface == MatSurface.Opaque ? "Unlit/Texture" : surface == MatSurface.Cutout ? "Unlit/Transparent Cutout" : "Unlit/Transparent");
                    break;
                case MatKind.Particle:
                    s = Shader.Find("Universal Render Pipeline/Particles/Unlit")
                        ?? Shader.Find(surface == MatSurface.Additive ? "Legacy Shaders/Particles/Additive" : "Legacy Shaders/Particles/Alpha Blended")
                        ?? Shader.Find("Sprites/Default");
                    break;
            }
            return s ?? Shader.Find("Sprites/Default");
        }

        /// <summary>Builds a material at runtime from its description (textures through Tex()).</summary>
        public static Material Create(MatDef d)
        {
            var m = new Material(FindShader(d.kind, d.surface)) { name = d.name };
            Configure(m, d, Tex);
            return m;
        }

        /// <summary>Writes every property of <paramref name="d"/> into <paramref name="m"/> for URP Lit/Unlit/Particles
        /// and the built-in Standard fallback. Shared by the runtime fallback and the editor MaterialBuilder.</summary>
        public static void Configure(Material m, MatDef d, Func<string, Texture2D> tex)
        {
            var baseMap = tex(d.tex);
            Color c = d.color;
            m.SetColor("_BaseColor", c); m.SetColor("_Color", c);
            m.SetTexture("_BaseMap", baseMap); m.SetTexture("_MainTex", baseMap);
            m.SetTextureScale("_BaseMap", d.tiling); m.SetTextureScale("_MainTex", d.tiling);

            if (d.kind == MatKind.Lit)
            {
                m.SetFloat("_WorkflowMode", 1f);
                m.SetFloat("_Metallic", d.metallic);
                m.SetFloat("_Smoothness", d.smoothness);
                m.SetFloat("_Glossiness", d.smoothness);
                var ms = tex(d.metalMap);
                m.SetTexture("_MetallicGlossMap", ms);
                SetKeyword(m, "_METALLICSPECGLOSSMAP", ms != null);
                SetKeyword(m, "_METALLICGLOSSMAP", ms != null);
                if (ms != null) { m.SetFloat("_Smoothness", 1f); m.SetFloat("_GlossMapScale", 1f); m.SetFloat("_Metallic", 1f); }
                var nrm = tex(d.normal);
                m.SetTexture("_BumpMap", nrm);
                m.SetFloat("_BumpScale", d.normalScale);
                SetKeyword(m, "_NORMALMAP", nrm != null);
                m.SetTextureScale("_BumpMap", d.tiling);
                bool emit = d.emissionIntensity > 0f && d.emission.maxColorComponent > 0f;
                var em = tex(d.emissionTex);
                // three.js: emissive * intensity in linear space
                Color e = emit ? (d.emission.linear * d.emissionIntensity).gamma : Color.black;
                m.SetColor("_EmissionColor", e);
                m.SetTexture("_EmissionMap", em);
                SetKeyword(m, "_EMISSION", emit);
                m.globalIlluminationFlags = emit ? MaterialGlobalIlluminationFlags.RealtimeEmissive : MaterialGlobalIlluminationFlags.EmissiveIsBlack;
                m.SetFloat("_ReceiveShadows", 1f);
                m.SetFloat("_SpecularHighlights", 1f);
                m.SetFloat("_EnvironmentReflections", 1f);
            }
            m.SetFloat("_Cull", d.twoSided ? (float)CullMode.Off : (float)CullMode.Back);
            m.doubleSidedGI = d.twoSided;
            SetSurface(m, d.surface, d.cutoff, d.kind);
        }

        static void SetSurface(Material m, MatSurface s, float cutoff, MatKind kind)
        {
            bool urp = m.shader != null && m.shader.name.StartsWith("Universal Render Pipeline");
            bool cut = s == MatSurface.Cutout, transp = s == MatSurface.Transparent || s == MatSurface.Additive;
            m.SetFloat("_AlphaClip", cut ? 1f : 0f);
            m.SetFloat("_Cutoff", cutoff);
            SetKeyword(m, "_ALPHATEST_ON", cut);
            m.SetFloat("_Surface", transp ? 1f : 0f);
            m.SetFloat("_Blend", s == MatSurface.Additive ? 2f : 0f);
            m.SetFloat("_ZWrite", transp ? 0f : 1f);
            m.SetFloat("_SrcBlend", transp ? (float)BlendMode.SrcAlpha : (float)BlendMode.One);
            m.SetFloat("_DstBlend", s == MatSurface.Additive ? (float)BlendMode.One : transp ? (float)BlendMode.OneMinusSrcAlpha : (float)BlendMode.Zero);
            m.SetFloat("_SrcBlendAlpha", transp ? (float)BlendMode.One : (float)BlendMode.One);
            m.SetFloat("_DstBlendAlpha", s == MatSurface.Additive ? (float)BlendMode.One : transp ? (float)BlendMode.OneMinusSrcAlpha : (float)BlendMode.Zero);
            SetKeyword(m, "_SURFACE_TYPE_TRANSPARENT", transp && urp);
            SetKeyword(m, "_ALPHAPREMULTIPLY_ON", false);
            if (!urp && kind == MatKind.Lit)
            {
                // built-in Standard shader: _Mode 0 opaque, 1 cutout, 3 transparent
                m.SetFloat("_Mode", cut ? 1f : transp ? 3f : 0f);
                SetKeyword(m, "_ALPHABLEND_ON", transp);
            }
            m.SetOverrideTag("RenderType", cut ? "TransparentCutout" : transp ? "Transparent" : "Opaque");
            m.renderQueue = cut ? (int)RenderQueue.AlphaTest : transp ? (int)RenderQueue.Transparent : (int)RenderQueue.Geometry;
            m.SetShaderPassEnabled("DepthOnly", !transp);
            m.SetShaderPassEnabled("ShadowCaster", !transp);
        }

        static void SetKeyword(Material m, string k, bool on) { if (on) m.EnableKeyword(k); else m.DisableKeyword(k); }
    }
}
