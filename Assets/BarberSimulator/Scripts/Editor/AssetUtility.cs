using System.IO;
using UnityEditor;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    public static class AssetUtility
    {
        public static void EnsureFolder(string path)
        {
            path = path.Replace('\\', '/').TrimEnd('/');
            if (AssetDatabase.IsValidFolder(path)) return;
            var parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            if (!string.IsNullOrEmpty(parent) && !AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        /// <summary>Creates or overwrites an asset in place, keeping its GUID so references survive regeneration.</summary>
        public static T SaveAsset<T>(T asset, string path) where T : Object
        {
            EnsureFolder(Path.GetDirectoryName(path));
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing == null)
            {
                AssetDatabase.CreateAsset(asset, path);
                return asset;
            }

            if (existing is Mesh existingMesh && asset is Mesh newMesh)
            {
                existingMesh.Clear();
                EditorUtility.CopySerialized(newMesh, existingMesh);
                Object.DestroyImmediate(newMesh);
                EditorUtility.SetDirty(existingMesh);
                return existing;
            }

            EditorUtility.CopySerialized(asset, existing);
            EditorUtility.SetDirty(existing);
            if (!AssetDatabase.Contains(asset)) Object.DestroyImmediate(asset);
            return existing;
        }

        public static Mesh SaveMesh(Mesh mesh, string name)
        {
            return SaveAsset(mesh, GeneratorPaths.Meshes + "/" + name + ".asset");
        }

        public static T Load<T>(string path) where T : Object
        {
            var asset = AssetDatabase.LoadAssetAtPath<T>(path);
            if (asset == null) Debug.LogWarning("[Generator] Missing asset: " + path);
            return asset;
        }

        public static Texture2D Texture(string fileName) => Load<Texture2D>(GeneratorPaths.Textures + "/" + fileName);
        public static Sprite Sprite(string fileName) => Load<Sprite>(GeneratorPaths.UISprites + "/" + fileName);
        public static AudioClip Clip(string relativePath) => Load<AudioClip>(GeneratorPaths.Audio + "/" + relativePath);
        public static Font Font(string fileName) => Load<Font>(GeneratorPaths.Fonts + "/" + fileName);

        public static GameObject SavePrefab(GameObject instance, string folder, string name)
        {
            EnsureFolder(folder);
            return PrefabUtility.SaveAsPrefabAssetAndConnect(instance, folder + "/" + name + ".prefab", InteractionMode.AutomatedAction);
        }
    }
}
