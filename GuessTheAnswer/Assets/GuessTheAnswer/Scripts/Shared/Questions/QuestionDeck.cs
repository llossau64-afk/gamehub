using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    /// <summary>
    /// The questions of one match. Draws never repeat a question while unused ones remain, and they follow
    /// the difficulty chosen by the host (with a little variety around it).
    /// </summary>
    public sealed class QuestionDeck
    {
        readonly QuestionBank bank;
        readonly IRandom rng;
        readonly List<QuestionData> pool;
        readonly HashSet<string> used = new HashSet<string>();
        readonly double[] weights;

        public QuestionDeck(QuestionBank bank, string category, Difficulty difficulty, IRandom rng)
        {
            this.bank = bank;
            this.rng = rng;
            pool = bank.Pool(category);
            rng.Shuffle(pool);
            weights = WeightsFor(difficulty);
        }

        public int PoolSize => pool.Count;

        static double[] WeightsFor(Difficulty difficulty)
        {
            // Index = Difficulty value (Easy, Normal, Hard, Expert).
            switch (difficulty)
            {
                case Difficulty.Easy: return new[] { 1.0, 0.25, 0.0, 0.0 };
                case Difficulty.Hard:
                case Difficulty.Expert: return new[] { 0.0, 0.55, 1.0, 1.0 };
                default: return new[] { 0.45, 1.0, 0.2, 0.0 };
            }
        }

        static readonly double[] TieBreakWeights = { 0.05, 0.4, 1.0, 1.0 };

        public QuestionData Draw()
        {
            return DrawWeighted(weights);
        }

        /// <summary>Tie breakers prefer hard questions.</summary>
        public QuestionData DrawTieBreak()
        {
            return DrawWeighted(TieBreakWeights);
        }

        QuestionData DrawWeighted(double[] levelWeights)
        {
            var counts = new int[4];
            foreach (var q in pool)
            {
                if (!used.Contains(q.id)) counts[(int)q.Level]++;
            }

            double total = 0;
            for (int i = 0; i < 4; i++) if (counts[i] > 0) total += levelWeights[i];

            QuestionData pick = null;
            if (total > 0)
            {
                double roll = rng.NextDouble() * total;
                int level = -1;
                for (int i = 0; i < 4; i++)
                {
                    if (counts[i] == 0 || levelWeights[i] <= 0) continue;
                    level = i;
                    roll -= levelWeights[i];
                    if (roll < 0) break;
                }
                if (level >= 0) pick = TakeFromPool(level);
            }

            // Fallbacks: any unused question of the category, then of any category, and only then a repeat.
            if (pick == null) pick = TakeFromPool(-1);
            if (pick == null) pick = TakeFrom(bank.All());
            if (pick == null)
            {
                used.Clear();
                pick = TakeFromPool(-1);
            }
            return pick;
        }

        QuestionData TakeFromPool(int level)
        {
            foreach (var q in pool)
            {
                if (used.Contains(q.id)) continue;
                if (level >= 0 && (int)q.Level != level) continue;
                used.Add(q.id);
                return q;
            }
            return null;
        }

        QuestionData TakeFrom(List<QuestionData> list)
        {
            rng.Shuffle(list);
            foreach (var q in list)
            {
                if (used.Contains(q.id)) continue;
                used.Add(q.id);
                return q;
            }
            return null;
        }
    }

    /// <summary>A drawn question with its answers in the order the players see them.</summary>
    public sealed class ActiveQuestion
    {
        public readonly QuestionData Data;
        /// <summary>DisplayOrder[displayIndex] = index into Data.answers.</summary>
        public readonly int[] DisplayOrder;
        public readonly int CorrectIndex;
        public readonly bool[] Removed = new bool[QuestionBank.AnswerCount];

        public ActiveQuestion(QuestionData data, IRandom rng)
        {
            Data = data;
            DisplayOrder = new[] { 0, 1, 2, 3 };
            if (!data.keepOrder) rng.Shuffle(DisplayOrder);
            CorrectIndex = 0;
            for (int i = 0; i < DisplayOrder.Length; i++)
            {
                if (DisplayOrder[i] == data.correctAnswerIndex) CorrectIndex = i;
            }
        }

        public string AnswerAt(int displayIndex)
        {
            return Data.answers[DisplayOrder[displayIndex]];
        }

        public bool IsSelectable(int displayIndex)
        {
            return displayIndex >= 0 && displayIndex < QuestionBank.AnswerCount && !Removed[displayIndex];
        }

        public string[] DisplayAnswers()
        {
            var result = new string[DisplayOrder.Length];
            for (int i = 0; i < result.Length; i++) result[i] = AnswerAt(i);
            return result;
        }

        /// <summary>50/50: removes two wrong answers at random, keeping the correct one and one wrong one.</summary>
        public void RemoveTwoWrong(IRandom rng)
        {
            var wrong = new List<int>(3);
            for (int i = 0; i < QuestionBank.AnswerCount; i++)
            {
                if (i != CorrectIndex && !Removed[i]) wrong.Add(i);
            }
            rng.Shuffle(wrong);
            for (int i = 0; i < wrong.Count - 1 && i < 2; i++) Removed[wrong[i]] = true;
        }
    }
}
