// Rendering plumbing for the world: the custom-shader materials (vertex colour lit,
// foliage wind/snow, terrain splat), instancing-ready model parts (assets.js assetParts),
// and per-chunk instance batches drawn with Graphics.DrawMeshInstanced.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Downfall
{
    public static class WorldMats
    {
        // global shader uniforms shared by every foliage material (assets.js `shared`)
        public static readonly int ID_TIME = Shader.PropertyToID("_DfTime"), ID_WIND = Shader.PropertyToID("_DfWind"), ID_SNOW = Shader.PropertyToID("_DfSnow");
        public static float time, wind = 0.4f, snow;

        public static void PushGlobals()
        {
            Shader.SetGlobalFloat(ID_TIME, time);
            Shader.SetGlobalFloat(ID_WIND, wind);
            Shader.SetGlobalFloat(ID_SNOW, snow);
        }

        static readonly Dictionary<string, Shader> shaders = new Dictionary<string, Shader>();
        /// <summary>A Downfall shader if it exists and runs on this device, else null.</summary>
        public static Shader Find(string name)
        {
            if (shaders.TryGetValue(name, out var s)) return s;
            s = Shader.Find(name);
            if (s != null && !s.isSupported) s = null;
            shaders[name] = s;
            return s;
        }

        static readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();

        static Texture BaseTex(Material m) => m == null ? null : m.HasProperty("_BaseMap") ? m.GetTexture("_BaseMap") : m.HasProperty("_MainTex") ? m.mainTexture : null;
        static UnityEngine.Color BaseCol(Material m) => m == null ? UnityEngine.Color.white : m.HasProperty("_BaseColor") ? m.GetColor("_BaseColor") : m.HasProperty("_Color") ? m.color : UnityEngine.Color.white;

        /// <summary>Vertex-coloured version of a registry material (the MatDefs VC() flag: terrain, rock,
        /// foliage, standStruct). Falls back to the plain registry material.</summary>
        public static Material VC(string name)
        {
            string key = "vc|" + name;
            if (cache.TryGetValue(key, out var m) && m) return m;
            var src = Mats.Get(name);
            var sh = Find("Downfall/Lit");
            if (sh == null) { cache[key] = src; return src; }
            m = new Material(sh) { name = name + " (vc)", enableInstancing = true };
            m.SetTexture("_BaseMap", BaseTex(src));
            m.SetTextureScale("_BaseMap", src.HasProperty("_BaseMap") ? src.GetTextureScale("_BaseMap") : Vector2.one);
            m.SetColor("_BaseColor", BaseCol(src));
            m.SetFloat("_UseVC", 1);
            var d = MatDefs.Find(name);
            if (d != null && d.twoSided) m.SetFloat("_Cull", 0);
            cache[key] = m;
            return m;
        }

        /// <summary>Plain colour material (Lit), cached by name.</summary>
        public static Material Solid(string name, int hex, float rough, float metal = 0, bool twoSided = false)
        {
            if (cache.TryGetValue(name, out var m) && m) return m;
            var d = MatDefs.Find(name);
            if (d == null) { d = new MatDef(name, MatDef.Hex(hex), rough, metal); if (twoSided) d.TwoSided(); }
            m = Mats.Create(d);
            m.enableInstancing = true;
            cache[name] = m;
            return m;
        }

        public static Material Get(string name) { var m = Mats.Get(name); if (m && !m.enableInstancing) m.enableInstancing = true; return m; }

        /// <summary>Unlit transparent colour (wires, birds, beacons) using the particle shader.</summary>
        public static Material Unlit(string name, Color c, bool additive, bool fog = true)
        {
            if (cache.TryGetValue(name, out var m) && m) return m;
            var sh = Find("Downfall/Particle");
            if (sh != null)
            {
                m = new Material(sh) { name = name };
                m.mainTexture = Texture2D.whiteTexture;
                m.SetFloat("_Src", (float)BlendMode.SrcAlpha);
                m.SetFloat("_Dst", (float)(additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
                m.SetFloat("_Fog", fog ? 1 : 0);
                m.renderQueue = 3000;
            }
            else
            {
                var d = new MatDef(name, c, 1).Unlit().TwoSided();
                if (additive) d.Additive(); else d.Transparent(c.a);
                m = Mats.Create(d);
            }
            m.color = c;
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            m.enableInstancing = true;
            cache[name] = m;
            return m;
        }

        // ---------------------------------------------------------------- foliage (assets.js patchFoliage)
        public static string Classify(string n)
        {
            n = n ?? "";
            if (n.Contains("needles")) return "needle";
            if (n.Contains("leaves")) return "leaf";
            if (n.Contains("grass") || n.Contains("fern")) return "grass";
            if (n.Contains("rock")) return "rock";
            if (n.Contains("bark")) return "bark";
            return null;
        }

        /// <summary>The wind-sway / world-snow version of a nature material (null kind: unchanged).</summary>
        public static Material Foliage(Material src)
        {
            if (src == null) return null;
            string kind = Classify(src.name);
            if (kind == null) return src;
            string key = "fol|" + src.name;
            if (cache.TryGetValue(key, out var m) && m) return m;
            var sh = Find("Downfall/Lit");
            if (sh == null) { cache[key] = src; return src; }
            bool card = kind == "leaf" || kind == "needle" || kind == "grass";
            m = new Material(sh) { name = src.name + " (fol)", enableInstancing = true };
            m.SetTexture("_BaseMap", BaseTex(src));
            m.SetColor("_BaseColor", BaseCol(src));
            m.SetFloat("_UseVC", 0);
            m.SetFloat("_Cutoff", card ? 0.45f : 0f);
            m.SetFloat("_Cull", card ? 0 : 2);
            if (card) { m.EnableKeyword("_ALPHATEST_ON"); m.renderQueue = (int)RenderQueue.AlphaTest; m.SetOverrideTag("RenderType", "TransparentCutout"); }
            float sx = kind == "rock" ? 0 : kind == "grass" ? 0.12f : 0.0035f;
            float sz = kind == "rock" ? 0 : kind == "grass" ? 0.08f : 0.0025f;
            m.SetVector("_Sway", new Vector4(sx, sz, kind == "leaf" ? 0.035f : 0f, kind == "grass" ? 1f : 0f));
            m.SetVector("_SnowK", new Vector4(kind == "rock" ? 0.45f : 0.25f, kind == "rock" ? 0.85f : 0.75f, 1, card && kind != "grass" ? 1 : 0));
            cache[key] = m;
            return m;
        }

        // ---------------------------------------------------------------- terrain (assets.js makeTerrainMaterial)
        static Material terrain;
        static bool terrainTried;
        public static Material Terrain(string quality)
        {
            if (terrainTried) return terrain;
            terrainTried = true;
            var sh = Find("Downfall/Terrain");
            var grass = Mats.Tex("Terrain/grass");
            if (sh == null || grass == null) return null;
            terrain = new Material(sh) { name = "terrainSplat" };
            foreach (var k in new[] { "grass", "forest", "dirt", "gravel", "rock", "snow", "sand" })
                terrain.SetTexture("_T_" + k, Mats.Tex("Terrain/" + k) ?? grass);
            if (quality != "low") terrain.EnableKeyword("_TRIPLANAR");
            return terrain;
        }
    }

    // ==================================================================== model parts

    /// <summary>One drawable piece of a model: mesh/submesh/material with the transform relative to the
    /// model root already baked into the mesh where possible (Unity space).</summary>
    public sealed class Part
    {
        public Mesh mesh;
        public int sub;
        public Material mat;
        public Matrix4x4 local = Matrix4x4.identity;
        public bool cast = true;
    }

    public sealed class PartSet
    {
        public string name;
        public readonly List<Part> parts = new List<Part>();
        public Bounds bounds;   // Unity space, model root
        public int Count => parts.Count;
        public Part this[int i] => parts[i];
    }

    public static class Parts
    {
        static readonly Dictionary<string, PartSet> cache = new Dictionary<string, PartSet>();

        /// <summary>assets.js assetParts(name): instancing parts of a prefab, or null when it is missing.</summary>
        public static PartSet Get(string name)
        {
            if (name == null) return null;
            if (cache.TryGetValue(name, out var ps)) return ps;
            ps = null;
            GameObject p = null;
            try { p = Mats.Prefab(name); } catch (Exception) { p = null; }
            if (p != null)
            {
                ps = new PartSet { name = name };
                var inv = p.transform.worldToLocalMatrix;
                bool first = true;
                bool nature = ArtIndex.PrefabPath(name)?.Contains("/Nature/") == true;
                foreach (var mf in p.GetComponentsInChildren<MeshFilter>(true))
                {
                    var mr = mf.GetComponent<MeshRenderer>();
                    var mesh = mf.sharedMesh;
                    if (mr == null || mesh == null) continue;
                    var local = inv * mf.transform.localToWorldMatrix;
                    bool ident = local == Matrix4x4.identity;
                    Mesh baked = mesh;
                    if (!ident && mesh.isReadable)
                    {
                        baked = UnityEngine.Object.Instantiate(mesh);
                        baked.name = mesh.name + "_baked";
                        var vs = baked.vertices; var ns = baked.normals;
                        var nm = local.inverse.transpose;
                        for (int i = 0; i < vs.Length; i++) vs[i] = local.MultiplyPoint3x4(vs[i]);
                        for (int i = 0; i < ns.Length; i++) ns[i] = nm.MultiplyVector(ns[i]).normalized;
                        baked.vertices = vs; if (ns.Length == vs.Length) baked.normals = ns;
                        baked.RecalculateBounds();
                        local = Matrix4x4.identity;
                    }
                    var mats = mr.sharedMaterials;
                    for (int s = 0; s < mesh.subMeshCount; s++)
                    {
                        var m = mats.Length > 0 ? mats[Math.Min(s, mats.Length - 1)] : null;
                        if (m == null) m = Mats.Get("foliage");
                        if (nature) m = WorldMats.Foliage(m);
                        if (!m.enableInstancing) m.enableInstancing = true;
                        ps.parts.Add(new Part { mesh = baked, sub = s, mat = m, local = local, cast = mr.shadowCastingMode != ShadowCastingMode.Off });
                    }
                    var b = Transform(baked.bounds, local);
                    if (first) { ps.bounds = b; first = false; } else ps.bounds.Encapsulate(b);
                }
                if (ps.parts.Count == 0) ps = null;
            }
            cache[name] = ps;
            return ps;
        }

        /// <summary>A procedural part set from game-space geometry (cached by key).</summary>
        public static PartSet FromGeo(string key, Func<Geo> build, Material mat, bool cast = true)
        {
            if (cache.TryGetValue(key, out var ps) && ps != null) return ps;
            var mesh = build().ToMesh(key);
            if (!mat.enableInstancing) mat.enableInstancing = true;
            ps = new PartSet { name = key, bounds = mesh.bounds };
            ps.parts.Add(new Part { mesh = mesh, mat = mat, cast = cast });
            cache[key] = ps;
            return ps;
        }

        public static PartSet Multi(string key, Func<PartSet> build)
        {
            if (cache.TryGetValue(key, out var ps) && ps != null) return ps;
            ps = build();
            cache[key] = ps;
            return ps;
        }

        public static Bounds Transform(Bounds b, Matrix4x4 m)
        {
            var c = m.MultiplyPoint3x4(b.center);
            var e = b.extents;
            var ax = m.MultiplyVector(new Vector3(e.x, 0, 0)); var ay = m.MultiplyVector(new Vector3(0, e.y, 0)); var az = m.MultiplyVector(new Vector3(0, 0, e.z));
            var ext = new Vector3(Mathf.Abs(ax.x) + Mathf.Abs(ay.x) + Mathf.Abs(az.x), Mathf.Abs(ax.y) + Mathf.Abs(ay.y) + Mathf.Abs(az.y), Mathf.Abs(ax.z) + Mathf.Abs(ay.z) + Mathf.Abs(az.z));
            return new Bounds(c, ext * 2);
        }

        /// <summary>A plain GameObject copy of a part set (debris after a smash).</summary>
        public static GameObject Instantiate(PartSet ps, Matrix4x4 unityMatrix, Transform parent)
        {
            var g = new GameObject(ps.name);
            g.transform.SetParent(parent, false);
            g.transform.position = unityMatrix.GetColumn(3);
            g.transform.rotation = unityMatrix.rotation;
            g.transform.localScale = unityMatrix.lossyScale;
            foreach (var p in ps.parts)
            {
                var c = new GameObject("part");
                c.transform.SetParent(g.transform, false);
                c.transform.localPosition = p.local.GetColumn(3);
                c.transform.localRotation = p.local.rotation;
                c.transform.localScale = p.local.lossyScale;
                c.AddComponent<MeshFilter>().sharedMesh = p.mesh;
                var r = c.AddComponent<MeshRenderer>();
                var mats = new Material[p.mesh.subMeshCount];
                for (int i = 0; i < mats.Length; i++) mats[i] = i == p.sub ? p.mat : null;
                if (p.mesh.subMeshCount > 1)
                {
                    // only the part's own submesh: draw it alone through a sub-mesh copy
                    var single = new Mesh { name = p.mesh.name + "_" + p.sub };
                    single.vertices = p.mesh.vertices; single.normals = p.mesh.normals; single.uv = p.mesh.uv;
                    single.triangles = p.mesh.GetTriangles(p.sub);
                    c.GetComponent<MeshFilter>().sharedMesh = single;
                    mats = new[] { p.mat };
                }
                r.sharedMaterials = mats;
                r.shadowCastingMode = ShadowCastingMode.On;
            }
            return g;
        }
    }

    // ==================================================================== instancing

    /// <summary>All instances of one part in one chunk/layer, split in arrays of ≤ 1023.</summary>
    public sealed class InstBatch
    {
        public Part part;
        public Matrix4x4[][] arr;
        public int[] count;
        public bool cast;

        public void Draw(int layer)
        {
            var sc = cast && part.cast ? ShadowCastingMode.On : ShadowCastingMode.Off;
            for (int i = 0; i < arr.Length; i++)
                Graphics.DrawMeshInstanced(part.mesh, part.sub, part.mat, arr[i], count[i], null, sc, true, layer);
        }
    }

    /// <summary>A pushed instance; World.Smash uses it to hide the instance (JS handle { e, i }).</summary>
    public sealed class InstHandle
    {
        public InstEntry e;
        public int i;
    }

    public sealed class InstEntry
    {
        public PartSet list;
        public bool cast;
        public int layer;
        public readonly List<Matrix4x4> mats = new List<Matrix4x4>(); // Unity space, per instance
        public readonly List<InstBatch> batches = new List<InstBatch>();
    }

    /// <summary>world.js instancer(): collects instance matrices per (model, layer) while a chunk builds.</summary>
    public sealed class Instancer
    {
        public const int NEAR = 0, FAR = 1, MID = 2, COVER = 3, BG = 4, GROUP = 5, LAYERS = 6;
        readonly Dictionary<string, InstEntry> inst = new Dictionary<string, InstEntry>();
        readonly List<InstEntry> order = new List<InstEntry>();

        /// <param name="gameMatrix">instance transform in game space (three.js compose)</param>
        public InstHandle Push(string key, PartSet list, Matrix4x4 gameMatrix, bool cast, int layer)
        {
            if (list == null) return null;
            string k = key + "|" + layer;
            if (!inst.TryGetValue(k, out var e))
            {
                e = new InstEntry { list = list, cast = cast, layer = layer };
                inst[k] = e; order.Add(e);
            }
            e.mats.Add(G.ToUnity(gameMatrix));
            return new InstHandle { e = e, i = e.mats.Count - 1 };
        }

        public void Flush(List<InstBatch>[] layers, ref Bounds bounds, ref bool hasBounds)
        {
            foreach (var e in order)
            {
                int n = e.mats.Count;
                if (n == 0) continue;
                for (int i = 0; i < n; i++)
                {
                    var p = (Vector3)e.mats[i].GetColumn(3);
                    if (!hasBounds) { bounds = new Bounds(p, Vector3.one); hasBounds = true; } else bounds.Encapsulate(p);
                }
                foreach (var part in e.list.parts)
                {
                    int nb = (n + 1022) / 1023;
                    var b = new InstBatch { part = part, cast = e.cast, arr = new Matrix4x4[nb][], count = new int[nb] };
                    for (int q = 0; q < nb; q++)
                    {
                        int c = Math.Min(1023, n - q * 1023);
                        b.arr[q] = new Matrix4x4[c]; b.count[q] = c;
                        bool id = part.local == Matrix4x4.identity;
                        for (int i = 0; i < c; i++) b.arr[q][i] = id ? e.mats[q * 1023 + i] : e.mats[q * 1023 + i] * part.local;
                    }
                    layers[e.layer].Add(b);
                    e.batches.Add(b);
                }
            }
            inst.Clear(); order.Clear();
        }
    }
}
