using System;
using System.Collections;
using System.Collections.Generic;
using GuessTheAnswer.Shared;
using UnityEngine;

namespace GuessTheAnswer.Questions
{
    /// <summary>
    /// Loads the category catalog and question packs from Resources/GTA/Data. New categories only need a JSON pack
    /// and an entry in categories.json. The client uses the packs for practice mode; online, the server picks questions.
    /// </summary>
    public sealed class ContentLibrary
    {
        public CategoryCatalog Catalog { get; private set; } = new CategoryCatalog();
        public QuestionBank Bank { get; private set; }

        readonly Dictionary<string, Color> colors = new Dictionary<string, Color>(StringComparer.OrdinalIgnoreCase);

        public IEnumerator Load(Action<float> progress)
        {
            var catalogAsset = Resources.Load<TextAsset>("GTA/Data/categories");
            if (catalogAsset != null)
            {
                try
                {
                    Catalog = JsonUtility.FromJson<CategoryCatalog>(catalogAsset.text) ?? new CategoryCatalog();
                }
                catch (Exception e)
                {
                    Debug.LogError("[Content] categories.json is invalid: " + e.Message);
                }
            }
            else
            {
                Debug.LogError("[Content] Resources/GTA/Data/categories.json is missing.");
            }
            if (Catalog.categories == null) Catalog.categories = new CategoryDefinition[0];

            Bank = new QuestionBank(Catalog);
            int total = Mathf.Max(1, Catalog.categories.Length);
            for (int i = 0; i < Catalog.categories.Length; i++)
            {
                var def = Catalog.categories[i];
                if (def == null) continue;
                if (def.enabled && !string.IsNullOrEmpty(def.pack))
                {
                    var request = Resources.LoadAsync<TextAsset>("GTA/Data/" + def.pack);
                    yield return request;
                    var asset = request.asset as TextAsset;
                    if (asset == null)
                    {
                        Debug.LogWarning("[Content] Question pack missing: " + def.pack);
                    }
                    else
                    {
                        try
                        {
                            var pack = JsonUtility.FromJson<QuestionPack>(asset.text);
                            if (pack != null && string.IsNullOrEmpty(pack.category)) pack.category = def.id;
                            Bank.AddPack(pack);
                        }
                        catch (Exception e)
                        {
                            Debug.LogError("[Content] Question pack '" + def.pack + "' is invalid: " + e.Message);
                        }
                    }
                }
                progress?.Invoke((i + 1f) / total);
            }

            foreach (var problem in Bank.Problems) Debug.LogWarning("[Content] Question skipped: " + problem);
        }

        public CategoryDefinition Category(string id)
        {
            return Catalog.Find(id) ?? Catalog.Find(CategoryIds.Classic);
        }

        public string CategoryName(string id)
        {
            var def = Catalog.Find(id);
            return def != null && !string.IsNullOrEmpty(def.name) ? def.name : (id ?? string.Empty).ToUpperInvariant();
        }

        public Color CategoryColor(string id, Color fallback)
        {
            if (string.IsNullOrEmpty(id)) return fallback;
            if (colors.TryGetValue(id, out var c)) return c;
            var def = Catalog.Find(id);
            if (def == null || !ColorUtility.TryParseHtmlString(def.color, out c)) c = fallback;
            colors[id] = c;
            return c;
        }

        /// <summary>Categories a host can pick, CLASSIC first.</summary>
        public List<CategoryDefinition> Selectable()
        {
            var list = new List<CategoryDefinition>();
            foreach (var c in Catalog.Enabled())
            {
                if (c.id == CategoryIds.Classic || Bank.CountFor(c.id) > 0) list.Add(c);
            }
            list.Sort((a, b) => a.id == CategoryIds.Classic ? -1 : b.id == CategoryIds.Classic ? 1 : 0);
            return list;
        }
    }
}
