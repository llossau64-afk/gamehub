using System;
using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    /// <summary>
    /// All loaded questions, indexed by category. Packs are parsed by the host runtime (JsonUtility in Unity,
    /// System.Text.Json on the server) and handed in as objects, so this class stays free of any JSON library.
    /// </summary>
    public sealed class QuestionBank
    {
        public const int AnswerCount = 4;

        readonly Dictionary<string, List<QuestionData>> byCategory = new Dictionary<string, List<QuestionData>>(StringComparer.OrdinalIgnoreCase);
        readonly Dictionary<string, QuestionData> byId = new Dictionary<string, QuestionData>(StringComparer.Ordinal);
        readonly List<string> problems = new List<string>();

        public CategoryCatalog Catalog { get; }
        public IReadOnlyList<string> Problems => problems;
        public int Count => byId.Count;

        public QuestionBank(CategoryCatalog catalog)
        {
            Catalog = catalog ?? new CategoryCatalog();
        }

        /// <summary>Adds a pack. Invalid questions are skipped and reported in <see cref="Problems"/>.</summary>
        public void AddPack(QuestionPack pack)
        {
            if (pack == null || pack.questions == null) return;
            foreach (var q in pack.questions)
            {
                if (q == null) continue;
                if (string.IsNullOrEmpty(q.category)) q.category = pack.category;
                string problem = Validate(q);
                if (problem != null)
                {
                    problems.Add((q.id ?? "<no id>") + ": " + problem);
                    continue;
                }
                if (byId.ContainsKey(q.id))
                {
                    problems.Add(q.id + ": duplicate id");
                    continue;
                }
                byId.Add(q.id, q);
                if (!byCategory.TryGetValue(q.category, out var list))
                {
                    list = new List<QuestionData>();
                    byCategory.Add(q.category, list);
                }
                list.Add(q);
            }
        }

        public static string Validate(QuestionData q)
        {
            if (string.IsNullOrEmpty(q.id)) return "missing id";
            if (string.IsNullOrEmpty(q.questionText)) return "missing question text";
            if (string.IsNullOrEmpty(q.category)) return "missing category";
            if (q.answers == null || q.answers.Length != AnswerCount) return "needs exactly " + AnswerCount + " answers";
            for (int i = 0; i < q.answers.Length; i++)
            {
                if (string.IsNullOrEmpty(q.answers[i]) || q.answers[i].Trim().Length == 0) return "empty answer " + i;
                for (int j = 0; j < i; j++)
                {
                    if (string.Equals(q.answers[i].Trim(), q.answers[j].Trim(), StringComparison.OrdinalIgnoreCase)) return "duplicate answers";
                }
            }
            if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.answers.Length) return "correctAnswerIndex out of range";
            return null;
        }

        public QuestionData Get(string id)
        {
            return id != null && byId.TryGetValue(id, out var q) ? q : null;
        }

        public int CountFor(string category)
        {
            return Pool(category).Count;
        }

        /// <summary>The questions a match in this category draws from. CLASSIC (or an unknown id) mixes every category marked for it.</summary>
        public List<QuestionData> Pool(string category)
        {
            var result = new List<QuestionData>();
            bool classic = string.IsNullOrEmpty(category) || string.Equals(category, CategoryIds.Classic, StringComparison.OrdinalIgnoreCase);
            if (!classic && byCategory.TryGetValue(category, out var list))
            {
                result.AddRange(list);
                return result;
            }
            foreach (var pair in byCategory)
            {
                var def = Catalog.Find(pair.Key);
                if (def != null && (!def.enabled || !def.includeInClassic)) continue;
                result.AddRange(pair.Value);
            }
            return result;
        }

        /// <summary>Every question regardless of category; the last-resort fallback for tie breakers.</summary>
        public List<QuestionData> All()
        {
            return new List<QuestionData>(byId.Values);
        }
    }
}
