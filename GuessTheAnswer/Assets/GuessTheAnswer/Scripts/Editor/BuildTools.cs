using System;
using System.IO;
using System.Linq;
using GuessTheAnswer.Shared;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace GuessTheAnswer.EditorTools
{
    /// <summary>Build and content tools: WebGL build (menu or command line) and question validation.</summary>
    public static class BuildTools
    {
        const string OutputPath = "Builds/WebGL";

        [MenuItem("Guess The Answer/Build WebGL", priority = 20)]
        public static void BuildWebGL()
        {
            if (!ValidateQuestions(false))
            {
                if (!EditorUtility.DisplayDialog("Guess The Answer", "Some questions are invalid (see the Console). Build anyway?", "Build", "Cancel")) return;
            }
            Build();
        }

        /// <summary>Unity -batchmode -projectPath GuessTheAnswer -executeMethod GuessTheAnswer.EditorTools.BuildTools.CommandLineBuild -quit</summary>
        public static void CommandLineBuild()
        {
            ProjectSetup.Run(false);
            var report = Build();
            EditorApplication.Exit(report != null && report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        static BuildReport Build()
        {
            ProjectSetup.Run(false);
            Directory.CreateDirectory(OutputPath);
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ProjectSetup.ScenePath },
                locationPathName = OutputPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(options);
            var s = report.summary;
            Debug.Log("[Guess The Answer] WebGL build " + s.result + ": " + (s.totalSize / (1024f * 1024f)).ToString("0.0") + " MB in " + s.totalTime.TotalSeconds.ToString("0") + " s → " + OutputPath);
            return report;
        }

        [MenuItem("Guess The Answer/Validate Questions", priority = 40)]
        public static void ValidateMenu()
        {
            bool ok = ValidateQuestions(true);
            EditorUtility.DisplayDialog("Guess The Answer", ok ? "All question packs are valid. Details are in the Console." : "Problems found. See the Console.", "OK");
        }

        /// <summary>Loads every pack like the game does and reports invalid questions and per-category counts.</summary>
        public static bool ValidateQuestions(bool verbose)
        {
            var catalogAsset = Resources.Load<TextAsset>("GTA/Data/categories");
            if (catalogAsset == null)
            {
                Debug.LogError("[Questions] Resources/GTA/Data/categories.json is missing.");
                return false;
            }
            var catalog = JsonUtility.FromJson<CategoryCatalog>(catalogAsset.text);
            var bank = new QuestionBank(catalog);
            bool ok = true;
            foreach (var def in catalog.categories)
            {
                if (string.IsNullOrEmpty(def.pack)) continue;
                var asset = Resources.Load<TextAsset>("GTA/Data/" + def.pack);
                if (asset == null)
                {
                    Debug.LogError("[Questions] Pack missing for category '" + def.id + "': " + def.pack);
                    ok = false;
                    continue;
                }
                try
                {
                    bank.AddPack(JsonUtility.FromJson<QuestionPack>(asset.text));
                }
                catch (Exception e)
                {
                    Debug.LogError("[Questions] " + def.pack + " is not valid JSON: " + e.Message);
                    ok = false;
                }
            }

            foreach (var p in bank.Problems)
            {
                Debug.LogError("[Questions] " + p);
                ok = false;
            }

            int needed = MatchSettings.RoundOptions.Max() * 2 + 1;
            foreach (var def in catalog.categories)
            {
                int count = bank.CountFor(def.id);
                if (count < needed)
                {
                    Debug.LogWarning("[Questions] '" + def.id + "' has " + count + " questions; a " + MatchSettings.RoundOptions.Max() + "-round match needs " + needed + " to avoid repeats.");
                }
                else if (verbose)
                {
                    Debug.Log("[Questions] " + def.id + ": " + count + " questions");
                }
            }
            if (verbose) Debug.Log("[Questions] Total: " + bank.Count);
            return ok;
        }
    }
}
