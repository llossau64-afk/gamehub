using BarberSimulator.Haircut;

namespace BarberSimulator.Customers
{
    /// <summary>Picks a review quote that explains the rating (so players learn why).</summary>
    public static class ReviewText
    {
        public static string KeyFor(int stars, HaircutIssue issue, System.Random rng)
        {
            if (stars >= 5) return "review.5." + (rng.Next(3) + 1);
            string issueKey;
            switch (issue)
            {
                case HaircutIssue.HarshFade: issueKey = "harsh_fade"; break;
                case HaircutIssue.Unfinished: issueKey = "unfinished"; break;
                case HaircutIssue.TooShort: issueKey = "too_short"; break;
                case HaircutIssue.TopTooShort: issueKey = "top_too_short"; break;
                case HaircutIssue.TooLong: issueKey = "too_long"; break;
                case HaircutIssue.Uneven: issueKey = "uneven"; break;
                default: return "review." + stars + ".1";
            }
            return "review.issue." + issueKey + (stars >= 3 ? ".mild" : ".bad");
        }
    }
}
