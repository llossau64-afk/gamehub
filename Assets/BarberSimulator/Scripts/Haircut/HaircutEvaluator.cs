using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Haircut
{
    public enum HaircutIssue
    {
        None,
        Unfinished,
        TooLong,
        TooShort,
        HarshFade,
        Uneven,
        TopTooShort
    }

    /// <summary>Result of comparing the head to the request. Scores are 0..1.</summary>
    public struct HaircutResult
    {
        public float Accuracy;
        public float FadeQuality;
        public float Symmetry;
        public float Completion;
        public float Total;
        public int Stars;
        public HaircutIssue MainIssue;
        public HairZone IssueZone;
    }

    /// <summary>
    /// Scores a haircut. Deliberately forgiving: the goal is that a player who follows the request roughly gets
    /// 3–4 stars, a careful player gets 5, and mistakes are explained by the main issue.
    /// </summary>
    public static class HaircutEvaluator
    {
        /// <param name="leniency">1 = normal; &gt;1 widens tolerances (tutorial / relaxed customers).</param>
        public static HaircutResult Evaluate(HairGrid grid, HaircutRequest request, float leniency)
        {
            var result = new HaircutResult();
            float weightSum = 0f, accuracySum = 0f;
            float worstPenalty = 0f;

            foreach (var target in request.Targets)
            {
                var stats = grid.Stats(target.zone, target.band);
                if (stats.Count == 0) continue;
                float tolerance = target.tolerance * leniency;
                float score = CellAccuracy(grid, target, tolerance, out float meanError, out bool shortSide);
                accuracySum += score * target.weight;
                weightSum += target.weight;

                float penalty = (1f - score) * target.weight;
                if (penalty > worstPenalty)
                {
                    worstPenalty = penalty;
                    result.IssueZone = target.zone;
                    bool isTop = target.zone == HairZone.Top || target.zone == HairZone.Front || target.zone == HairZone.Crown;
                    if (shortSide) result.MainIssue = isTop ? HaircutIssue.TopTooShort : HaircutIssue.TooShort;
                    else result.MainIssue = stats.TouchedFraction < 0.35f && stats.InitialAverage - target.length > tolerance
                        ? HaircutIssue.Unfinished
                        : HaircutIssue.TooLong;
                }
            }

            result.Accuracy = weightSum > 0f ? accuracySum / weightSum : 1f;
            result.Completion = Completion(grid, request, leniency);
            result.FadeQuality = request.RequiresFade ? FadeQuality(grid, leniency) : 1f;
            result.Symmetry = Symmetry(grid, leniency);

            float blended = result.Accuracy * 0.55f + result.FadeQuality * 0.2f + result.Symmetry * 0.08f + result.Completion * 0.17f;
            // A requested fade that is not there caps the result, whatever else went right.
            if (request.RequiresFade) blended *= Mathf.Lerp(0.7f, 1f, result.FadeQuality);
            result.Total = Mathf.Clamp01(blended);

            // The main issue shown to the player follows the weakest component.
            if (request.RequiresFade && result.FadeQuality < 0.6f && result.FadeQuality < result.Accuracy) result.MainIssue = HaircutIssue.HarshFade;
            if (result.Completion < 0.55f) result.MainIssue = HaircutIssue.Unfinished;
            if (result.Symmetry < 0.55f && result.MainIssue == HaircutIssue.None) result.MainIssue = HaircutIssue.Uneven;
            if (result.Total >= 0.86f) result.MainIssue = HaircutIssue.None;

            result.Stars = result.Total >= 0.86f ? 5 : result.Total >= 0.73f ? 4 : result.Total >= 0.58f ? 3 : result.Total >= 0.4f ? 2 : 1;
            return result;
        }

        /// <summary>Per-cell accuracy so a half-cut zone is not hidden by its average.</summary>
        private static float CellAccuracy(HairGrid grid, ZoneTarget target, float tolerance, out float meanError, out bool mostlyTooShort)
        {
            float sum = 0f, errorSum = 0f; int n = 0, shortCount = 0;
            float range = Mathf.Max(0.25f, target.length * 0.3f);
            grid.ForEach((c, r, cell) =>
            {
                if (cell.Zone != target.zone) return;
                if (target.band != HairBand.Any && cell.Band != target.band) return;
                float error = cell.Length - target.length;
                float excess = Mathf.Max(0f, Mathf.Abs(error) - tolerance);
                // Too short cannot be undone, so it is penalised a little harder than too long.
                float scale = error < 0f ? range * 0.6f : range;
                sum += Mathf.Exp(-excess / scale);
                errorSum += error;
                if (error < -tolerance) shortCount++;
                n++;
            });
            meanError = n > 0 ? errorSum / n : 0f;
            mostlyTooShort = n > 0 && shortCount > n * 0.4f;
            return n > 0 ? sum / n : 1f;
        }

        /// <summary>Fraction of cells that needed cutting and were actually cut.</summary>
        private static float Completion(HairGrid grid, HaircutRequest request, float leniency)
        {
            int needed = 0, done = 0;
            foreach (var target in request.Targets)
            {
                float tolerance = target.tolerance * leniency;
                grid.ForEach((c, r, cell) =>
                {
                    if (cell.Zone != target.zone) return;
                    if (target.band != HairBand.Any && cell.Band != target.band) return;
                    if (cell.InitialLength - target.length <= tolerance) return;
                    needed++;
                    if (cell.Length <= target.length + tolerance * 1.5f) done++;
                });
            }
            return needed > 0 ? Mathf.Clamp01((float)done / needed) : 1f;
        }

        /// <summary>
        /// Walks every column of the sides and back from the bottom up and looks at length steps between neighbouring
        /// rows. A fade should grow gradually; big jumps (a "line") and getting shorter going up both cost points.
        /// </summary>
        private static float FadeQuality(HairGrid grid, float leniency)
        {
            float allowedStep = 0.55f * leniency;
            float penaltySum = 0f; int samples = 0;
            for (int c = 0; c < HairGrid.Columns; c++)
            {
                float previous = -1f;
                for (int r = 0; r < HairGrid.Rows; r++)
                {
                    if (!grid.GrowsAt(c, r)) { previous = -1f; continue; }
                    var cell = grid[c, r];
                    if (!HairZoneUtility.HasBands(cell.Zone) && cell.Zone != HairZone.Nape) { previous = -1f; continue; }
                    if (previous >= 0f)
                    {
                        float step = cell.Length - previous;
                        float harsh = Mathf.Max(0f, step - allowedStep);       // sudden jump up = visible line
                        float inverted = Mathf.Max(0f, -step - 0.25f * leniency); // shorter higher up
                        penaltySum += Mathf.Clamp01(harsh / 1.2f + inverted / 0.8f);
                        samples++;
                    }
                    previous = cell.Length;
                }
            }

            // The fade also needs an actual gradient: lower band clearly shorter than the upper band.
            float gradient = 0f; int sides = 0;
            foreach (var zone in new[] { HairZone.LeftSide, HairZone.RightSide, HairZone.Back })
            {
                var lower = grid.Stats(zone, HairBand.Lower);
                var upper = grid.Stats(zone, HairBand.Upper);
                if (lower.Count == 0 || upper.Count == 0) continue;
                gradient += Mathf.Clamp01((upper.Average - lower.Average) / 0.6f);
                sides++;
            }
            float smoothness = samples > 0 ? 1f - penaltySum / samples * 2.2f : 1f;
            float gradientScore = sides > 0 ? gradient / sides : 0f;
            return Mathf.Clamp01(smoothness) * Mathf.Lerp(0.35f, 1f, gradientScore);
        }

        private static float Symmetry(HairGrid grid, float leniency)
        {
            float diff = 0f; int n = 0;
            foreach (var band in new[] { HairBand.Lower, HairBand.Middle, HairBand.Upper })
            {
                var left = grid.Stats(HairZone.LeftSide, band);
                var right = grid.Stats(HairZone.RightSide, band);
                if (left.Count == 0 || right.Count == 0) continue;
                diff += Mathf.Abs(left.Average - right.Average);
                n++;
            }
            var lt = grid.Stats(HairZone.LeftTemple);
            var rt = grid.Stats(HairZone.RightTemple);
            if (lt.Count > 0 && rt.Count > 0) { diff += Mathf.Abs(lt.Average - rt.Average); n++; }
            if (n == 0) return 1f;
            return Mathf.Clamp01(1f - Mathf.Max(0f, diff / n - 0.15f * leniency) / 0.8f);
        }

        /// <summary>Rough per-checklist status for the HUD: 0 = untouched, 1 = in progress, 2 = looks right.</summary>
        public static Dictionary<string, int> ChecklistStatus(HairGrid grid, HaircutRequest request, float leniency)
        {
            var status = new Dictionary<string, int>();
            var progress = new Dictionary<string, Vector2>();
            foreach (var target in request.Targets)
            {
                if (string.IsNullOrEmpty(target.checklistKey)) continue;
                var stats = grid.Stats(target.zone, target.band);
                if (stats.Count == 0) continue;
                float tolerance = target.tolerance * leniency * 1.5f;
                bool needsCut = stats.InitialAverage - target.length > tolerance;
                float state = !needsCut ? 2f
                    : Mathf.Abs(stats.Average - target.length) <= tolerance ? 2f
                    : stats.TouchedFraction > 0.15f ? 1f : 0f;
                progress.TryGetValue(target.checklistKey, out var acc);
                progress[target.checklistKey] = new Vector2(acc.x + state, acc.y + 1f);
            }
            foreach (var pair in progress)
            {
                float avg = pair.Value.x / pair.Value.y;
                status[pair.Key] = avg >= 1.95f ? 2 : avg >= 0.4f ? 1 : 0;
            }
            if (request.RequiresFade)
            {
                float fade = FadeQuality(grid, leniency * 1.3f);
                var lower = grid.Stats(HairZone.LeftSide, HairBand.Lower);
                status["check.fade"] = lower.TouchedFraction < 0.2f ? 0 : fade > 0.7f ? 2 : 1;
            }
            return status;
        }
    }
}
