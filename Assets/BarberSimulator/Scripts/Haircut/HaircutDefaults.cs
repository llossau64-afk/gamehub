using System.Collections.Generic;

namespace BarberSimulator.Haircut
{
    /// <summary>
    /// Authoring defaults for the Phase 2 hairstyles. The editor generator turns these into HaircutRequest assets;
    /// afterwards the assets are the source of truth and can be tuned in the inspector.
    /// Lengths in cm. Guards: #0 ≈ 0.05, #½ ≈ 0.15, #1 ≈ 0.3, #2 ≈ 0.6, #3 ≈ 1.0, #4 ≈ 1.3.
    /// </summary>
    public static class HaircutDefaults
    {
        public sealed class Definition
        {
            public string Id;
            public string NameKey;
            public string[] AskKeys;
            public int Price;
            public bool Fade;
            public string[] TutorialHints;
            public List<ZoneTarget> Targets = new List<ZoneTarget>();
        }

        private static ZoneTarget T(HairZone zone, HairBand band, float length, float tolerance, float weight, string check)
            => new ZoneTarget { zone = zone, band = band, length = length, tolerance = tolerance, weight = weight, checklistKey = check };

        private static void Sides(Definition d, float lower, float middle, float upper, float tolerance, string check)
        {
            foreach (var zone in new[] { HairZone.LeftSide, HairZone.RightSide, HairZone.Back })
            {
                d.Targets.Add(T(zone, HairBand.Lower, lower, tolerance, 1.2f, check));
                d.Targets.Add(T(zone, HairBand.Middle, middle, tolerance * 1.2f, 1f, check));
                d.Targets.Add(T(zone, HairBand.Upper, upper, tolerance * 1.4f, 0.9f, check));
            }
        }

        private static void Top(Definition d, float length, float tolerance)
        {
            d.Targets.Add(T(HairZone.Top, HairBand.Any, length, tolerance, 1.2f, "check.top"));
            d.Targets.Add(T(HairZone.Front, HairBand.Any, length, tolerance, 0.8f, "check.top"));
            d.Targets.Add(T(HairZone.Crown, HairBand.Any, length, tolerance * 1.2f, 0.6f, "check.top"));
        }

        private static void Edges(Definition d, float temples, float nape, float tolerance)
        {
            d.Targets.Add(T(HairZone.LeftTemple, HairBand.Any, temples, tolerance, 0.6f, "check.edges"));
            d.Targets.Add(T(HairZone.RightTemple, HairBand.Any, temples, tolerance, 0.6f, "check.edges"));
            d.Targets.Add(T(HairZone.Nape, HairBand.Any, nape, tolerance, 0.6f, "check.edges"));
        }

        public static List<Definition> All()
        {
            var list = new List<Definition>();

            var buzz = new Definition
            {
                Id = "buzz_cut", NameKey = "haircut.buzz_cut", Price = 18, Fade = false,
                AskKeys = new[] { "ask.buzz_cut.1", "ask.buzz_cut.2" },
                TutorialHints = new[] { "tut.buzz.1", "tut.buzz.2" }
            };
            Sides(buzz, 0.6f, 0.6f, 0.6f, 0.3f, "check.sides");
            Top(buzz, 0.6f, 0.35f);
            Edges(buzz, 0.6f, 0.6f, 0.35f);
            list.Add(buzz);

            var lowFade = new Definition
            {
                Id = "low_fade", NameKey = "haircut.low_fade", Price = 28, Fade = true,
                AskKeys = new[] { "ask.low_fade.1", "ask.low_fade.2" },
                TutorialHints = new[] { "tut.fade.1", "tut.fade.2", "tut.fade.3", "tut.fade.4", "tut.fade.5", "tut.fade.6" }
            };
            Sides(lowFade, 0.2f, 0.6f, 1.3f, 0.3f, "check.sides");
            Top(lowFade, 3.6f, 1.0f);
            Edges(lowFade, 0.4f, 0.2f, 0.3f);
            list.Add(lowFade);

            var midFade = new Definition
            {
                Id = "mid_fade", NameKey = "haircut.mid_fade", Price = 30, Fade = true,
                AskKeys = new[] { "ask.mid_fade.1", "ask.mid_fade.2" },
                TutorialHints = new[] { "tut.fade.1", "tut.fade.2", "tut.fade.3", "tut.fade.4", "tut.fade.5", "tut.fade.6" }
            };
            Sides(midFade, 0.1f, 0.3f, 1.0f, 0.25f, "check.sides");
            Top(midFade, 3.2f, 0.9f);
            Edges(midFade, 0.3f, 0.1f, 0.25f);
            list.Add(midFade);

            var taper = new Definition
            {
                Id = "basic_taper", NameKey = "haircut.basic_taper", Price = 24, Fade = false,
                AskKeys = new[] { "ask.taper.1", "ask.taper.2" },
                TutorialHints = new[] { "tut.taper.1", "tut.taper.2" }
            };
            Sides(taper, 1.0f, 1.8f, 2.4f, 0.45f, "check.sides");
            Top(taper, 4.4f, 1.0f);
            Edges(taper, 0.4f, 0.3f, 0.3f);
            list.Add(taper);

            var trim = new Definition
            {
                Id = "short_trim", NameKey = "haircut.short_trim", Price = 22, Fade = false,
                AskKeys = new[] { "ask.trim.1", "ask.trim.2" },
                TutorialHints = new[] { "tut.trim.1", "tut.trim.2" }
            };
            Sides(trim, 1.3f, 1.5f, 1.8f, 0.45f, "check.sides");
            Top(trim, 3.6f, 0.8f);
            Edges(trim, 1.0f, 1.0f, 0.4f);
            list.Add(trim);

            return list;
        }
    }
}
