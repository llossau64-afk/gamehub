using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Rendering;

namespace Downfall.EditorTools
{
    /// <summary>
    /// Turns every converted FBX in Art/Models/&lt;Category&gt;/ into Resources/Prefabs/&lt;Category&gt;/&lt;name&gt;.prefab
    /// with the registry materials (Resources/Materials) assigned, so the runtime can do
    /// Resources.Load&lt;GameObject&gt;("Prefabs/Cars/car_dusty") or Mats.Prefab("pine0_lod0").
    /// Node names are the GLB node names the JS uses (cars: "&lt;id&gt;__&lt;part&gt;" meshes and anchor empties).
    /// </summary>
    public static class PrefabBuilder
    {
        public const float FoxScale = 0.0055f; // animals.js: "the sample fox is modelled in centimetres"

        public static void Build()
        {
            if (!AssetDatabase.IsValidFolder(DownfallPaths.Models)) { Debug.LogWarning("[Downfall] no " + DownfallPaths.Models); return; }
            int n = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:GameObject", new[] { DownfallPaths.Models }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (!path.EndsWith(".fbx", System.StringComparison.OrdinalIgnoreCase)) continue;
                string category = Path.GetFileName(Path.GetDirectoryName(path));
                string name = Path.GetFileNameWithoutExtension(path);
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (model == null) continue;
                try { BuildOne(model, category, name, path); n++; }
                catch (System.Exception e) { Debug.LogError("[Downfall] prefab " + name + ": " + e); }
            }
            AssetDatabase.SaveAssets();
            Debug.Log("[Downfall] PrefabBuilder: " + n + " prefabs");
        }

        static void BuildOne(GameObject model, string category, string name, string modelPath)
        {
            string dir = DownfallPaths.Prefabs + "/" + category;
            DownfallPaths.EnsureFolder(dir);
            var inst = (GameObject)Object.Instantiate(model);
            inst.name = name;
            GameObject root = inst;
            bool fox = category == "Animals" && name == "fox";
            string carId = category == "Cars" && name.StartsWith("car_") ? name.Substring(4) : null;

            foreach (var r in inst.GetComponentsInChildren<Renderer>(true))
            {
                var mats = r.sharedMaterials;
                string part = PartName(r.gameObject.name, carId);
                for (int i = 0; i < mats.Length; i++)
                {
                    string src = Clean(mats[i] != null ? mats[i].name : "");
                    string target = carId != null && src.StartsWith("car_")
                        ? ArtIndex.CarPartMaterial(carId, src.Substring(4), part)
                        : "Models/" + Sanitize(src);
                    var m = LoadMat(target) ?? LoadMat("Models/" + Sanitize(src));
                    if (m != null) mats[i] = m;
                    else Debug.LogWarning("[Downfall] " + name + "/" + r.name + ": no material " + target);
                }
                r.sharedMaterials = mats;
                r.receiveShadows = true;
                bool noShadow = carId != null && ArtIndex.CarNoShadow.Contains(part);
                foreach (var m in mats)
                {
                    var d = m != null ? MatDefs.Find(MatName(m)) : null;
                    if (d != null && (d.noShadows || d.surface == MatSurface.Transparent)) noShadow = noShadow || mats.Length == 1;
                }
                r.shadowCastingMode = noShadow ? ShadowCastingMode.Off : ShadowCastingMode.On;
                if (r is SkinnedMeshRenderer smr) smr.updateWhenOffscreen = true; // JS: frustumCulled = false
            }

            if (fox)
            {
                // identity root so runtime code can position/rotate it; the model keeps the FBX axis
                // conversion and gets the JS centimetre -> metre scale.
                root = new GameObject("fox");
                inst.name = "model";
                inst.transform.SetParent(root.transform, false);
                inst.transform.localScale = inst.transform.localScale * FoxScale;
                var anim = inst.GetComponent<Animator>() ?? inst.AddComponent<Animator>();
                anim.runtimeAnimatorController = FoxController(dir, modelPath);
                anim.applyRootMotion = false;
                anim.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            }

            PrefabUtility.SaveAsPrefabAsset(root, dir + "/" + name + ".prefab");
            Object.DestroyImmediate(root);
        }

        /// <summary>AnimatorController with the three glTF actions as looping states (default Survey = JS idle).</summary>
        static RuntimeAnimatorController FoxController(string dir, string modelPath)
        {
            string path = dir + "/fox.controller";
            AssetDatabase.DeleteAsset(path);
            var ctrl = AnimatorController.CreateAnimatorControllerAtPath(path);
            var sm = ctrl.layers[0].stateMachine;
            var clips = new Dictionary<string, AnimationClip>();
            foreach (var o in AssetDatabase.LoadAllAssetsAtPath(modelPath))
                if (o is AnimationClip c && !c.name.StartsWith("__preview__")) clips[c.name] = c;
            AnimatorState first = null;
            foreach (var n in new[] { "Survey", "Walk", "Run" })
            {
                if (!clips.TryGetValue(n, out var clip)) continue;
                var st = sm.AddState(n);
                st.motion = clip;
                if (n == "Survey") first = st;
            }
            if (first != null) sm.defaultState = first;
            EditorUtility.SetDirty(ctrl);
            return ctrl;
        }

        static Material LoadMat(string name) => AssetDatabase.LoadAssetAtPath<Material>(DownfallPaths.Materials + "/" + name + ".mat");

        static string MatName(Material m)
        {
            string p = AssetDatabase.GetAssetPath(m);
            if (string.IsNullOrEmpty(p) || !p.StartsWith(DownfallPaths.Materials + "/")) return m.name;
            p = p.Substring(DownfallPaths.Materials.Length + 1);
            return p.EndsWith(".mat") ? p.Substring(0, p.Length - 4) : p;
        }

        /// <summary>"dusty__fenderFR" → "fenderFR" (JS: o.name.slice(id.length + 2)).</summary>
        static string PartName(string node, string carId)
        {
            if (carId != null && node.StartsWith(carId + "__")) return node.Substring(carId.Length + 2);
            return node;
        }

        /// <summary>Unity may suffix imported material names (" (Instance)", Blender ".001").</summary>
        static string Clean(string n)
        {
            n = n.Replace(" (Instance)", "");
            int dot = n.LastIndexOf('.');
            if (dot > 0 && dot < n.Length - 1 && int.TryParse(n.Substring(dot + 1), out _)) n = n.Substring(0, dot);
            return n;
        }

        static string Sanitize(string n) => System.Text.RegularExpressions.Regex.Replace(n, "[^A-Za-z0-9_]+", "_");
    }
}
