using System;
using System.IO;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Server
{
    /// <summary>Loads the category catalog and every question pack it lists from the Data folder.</summary>
    public static class QuestionLoader
    {
        public static QuestionBank Load(string dataDirectory, Action<string> log)
        {
            string catalogPath = Path.Combine(dataDirectory, "categories.json");
            var catalog = Json.Read<CategoryCatalog>(File.ReadAllText(catalogPath)) ?? new CategoryCatalog();
            var bank = new QuestionBank(catalog);

            foreach (var category in catalog.categories)
            {
                if (category == null || !category.enabled || string.IsNullOrEmpty(category.pack)) continue;
                string path = Path.Combine(dataDirectory, category.pack + ".json");
                if (!File.Exists(path))
                {
                    log("Question pack missing: " + path);
                    continue;
                }
                var pack = Json.Read<QuestionPack>(File.ReadAllText(path));
                if (pack != null && string.IsNullOrEmpty(pack.category)) pack.category = category.id;
                bank.AddPack(pack);
            }

            foreach (var problem in bank.Problems) log("Question skipped: " + problem);
            log("Loaded " + bank.Count + " questions.");
            return bank;
        }
    }
}
