using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace Downfall.EditorTools
{
    /// <summary>
    /// Reflection shims for editor APIs that exist in Unity 6 but not in the old UnityEditor.dll used by
    /// the offline compile check (PrefabUtility.SaveAsPrefabAsset, ModelImporter.materialImportMode …).
    /// </summary>
    public static class EditorCompat
    {
        /// <summary>Sets a property; enum values may be given by name. Returns false when it does not exist.</summary>
        public static bool Set(object target, string property, object value)
        {
            var p = target.GetType().GetProperty(property, BindingFlags.Public | BindingFlags.Instance);
            if (p == null || !p.CanWrite) return false;
            object v = value;
            if (p.PropertyType.IsEnum && value is string s) v = System.Enum.Parse(p.PropertyType, s);
            else if (p.PropertyType.IsEnum && value is int i) v = System.Enum.ToObject(p.PropertyType, i);
            p.SetValue(target, v, null);
            return true;
        }

        public static GameObject SaveAsPrefab(GameObject root, string path)
        {
            foreach (var m in typeof(PrefabUtility).GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name != "SaveAsPrefabAsset") continue;
                var ps = m.GetParameters();
                if (ps.Length == 2 && ps[0].ParameterType == typeof(GameObject) && ps[1].ParameterType == typeof(string))
                    return (GameObject)m.Invoke(null, new object[] { root, path });
            }
            Debug.LogError("[Downfall] PrefabUtility.SaveAsPrefabAsset not available");
            return null;
        }
    }
}
