using System;
using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    /// <summary>One multiple-choice question as stored in the JSON question packs.</summary>
    [Serializable]
    public class QuestionData
    {
        public string id;
        public string questionText;
        public string category;
        /// <summary>"easy", "normal", "hard" or "expert".</summary>
        public string difficulty = "normal";
        public string[] answers = new string[0];
        public int correctAnswerIndex;
        /// <summary>Optional sprite name (Resources/GTA/QuestionImages/&lt;name&gt;).</summary>
        public string optionalImage;
        public string optionalExplanation;
        /// <summary>Keep the authored answer order (e.g. answers that are numbers in ascending order).</summary>
        public bool keepOrder;

        [NonSerialized] Difficulty? parsedDifficulty;

        public Difficulty Level
        {
            get
            {
                if (!parsedDifficulty.HasValue) parsedDifficulty = ParseDifficulty(difficulty);
                return parsedDifficulty.Value;
            }
        }

        public static Difficulty ParseDifficulty(string value)
        {
            switch ((value ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "easy": return Difficulty.Easy;
                case "hard": return Difficulty.Hard;
                case "expert": return Difficulty.Expert;
                default: return Difficulty.Normal;
            }
        }
    }

    /// <summary>A JSON file with the questions of one category.</summary>
    [Serializable]
    public class QuestionPack
    {
        public string category;
        public int version = 1;
        public QuestionData[] questions = new QuestionData[0];
    }

    [Serializable]
    public class CategoryDefinition
    {
        public string id;
        public string name;
        /// <summary>Icon sprite name in Resources/GTA/Icons.</summary>
        public string icon;
        /// <summary>Hex colour, e.g. "#3D8BFF".</summary>
        public string color;
        public bool enabled = true;
        /// <summary>Whether CLASSIC draws from this category.</summary>
        public bool includeInClassic = true;
        /// <summary>Resource name of the question pack (without extension). Empty for CLASSIC.</summary>
        public string pack;
    }

    [Serializable]
    public class CategoryCatalog
    {
        public CategoryDefinition[] categories = new CategoryDefinition[0];

        public CategoryDefinition Find(string id)
        {
            if (categories == null || string.IsNullOrEmpty(id)) return null;
            for (int i = 0; i < categories.Length; i++)
            {
                if (string.Equals(categories[i].id, id, StringComparison.OrdinalIgnoreCase)) return categories[i];
            }
            return null;
        }

        public List<CategoryDefinition> Enabled()
        {
            var list = new List<CategoryDefinition>();
            if (categories == null) return list;
            foreach (var c in categories) if (c != null && c.enabled) list.Add(c);
            return list;
        }
    }
}
