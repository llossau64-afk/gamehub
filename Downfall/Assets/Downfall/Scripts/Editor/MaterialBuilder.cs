using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Downfall.EditorTools
{
    /// <summary>
    /// Writes Resources/TexRegistry.asset (every texture under Art/Textures, keyed by its relative path)
    /// and one .mat per <see cref="MatDefs"/> entry under Resources/Materials/ (URP Lit/Unlit/Particles,
    /// built-in Standard as fallback). Existing assets are updated in place so GUIDs stay stable.
    /// </summary>
    public static class MaterialBuilder
    {
        static Dictionary<string, Texture2D> textures;

        public static void Build()
        {
            BuildRegistry();
            DownfallPaths.EnsureFolder(DownfallPaths.Materials);
            int made = 0, missingTex = 0;
            foreach (var d in MatDefs.All)
            {
                string path = DownfallPaths.Materials + "/" + d.name + ".mat";
                DownfallPaths.EnsureFolder(Path.GetDirectoryName(path).Replace('\\', '/'));
                var shader = Mats.FindShader(d.kind, d.surface);
                var m = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (m == null)
                {
                    m = new Material(shader) { name = Path.GetFileName(d.name) };
                    AssetDatabase.CreateAsset(m, path);
                }
                else if (m.shader != shader) m.shader = shader;
                Mats.Configure(m, d, key =>
                {
                    var t = Tex(key);
                    if (key != null && t == null) { missingTex++; Debug.LogWarning("[Downfall] material " + d.name + ": texture '" + key + "' not found"); }
                    return t;
                });
                EditorUtility.SetDirty(m);
                made++;
            }
            AssetDatabase.SaveAssets();
            Debug.Log("[Downfall] MaterialBuilder: " + made + " materials" + (missingTex > 0 ? ", " + missingTex + " missing textures" : ""));
        }

        /// <summary>Texture by registry key ("Generated/rock"), from the AssetDatabase.</summary>
        public static Texture2D Tex(string key)
        {
            if (string.IsNullOrEmpty(key)) return null;
            if (textures == null) ScanTextures();
            return textures.TryGetValue(key, out var t) ? t : null;
        }

        static void ScanTextures()
        {
            textures = new Dictionary<string, Texture2D>();
            if (!AssetDatabase.IsValidFolder(DownfallPaths.Textures)) return;
            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { DownfallPaths.Textures }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                string rel = path.Substring(DownfallPaths.Textures.Length + 1);
                string key = Path.Combine(Path.GetDirectoryName(rel), Path.GetFileNameWithoutExtension(rel)).Replace('\\', '/');
                var t = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
                if (t != null) textures[key] = t;
            }
        }

        public static void BuildRegistry()
        {
            textures = null;
            ScanTextures();
            DownfallPaths.EnsureFolder(DownfallPaths.Resources);
            var reg = AssetDatabase.LoadAssetAtPath<TexRegistry>(DownfallPaths.Registry);
            if (reg == null)
            {
                reg = ScriptableObject.CreateInstance<TexRegistry>();
                AssetDatabase.CreateAsset(reg, DownfallPaths.Registry);
            }
            var keys = new List<string>(textures.Keys);
            keys.Sort(System.StringComparer.Ordinal);
            reg.keys = keys.ToArray();
            reg.textures = new Texture2D[keys.Count];
            for (int i = 0; i < keys.Count; i++) reg.textures[i] = textures[keys[i]];
            EditorUtility.SetDirty(reg);
            AssetDatabase.SaveAssets();
        }
    }
}
