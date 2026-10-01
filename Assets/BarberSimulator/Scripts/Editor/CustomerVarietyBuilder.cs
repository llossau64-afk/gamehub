using System.Collections.Generic;
using System.Linq;
using BarberSimulator.Customers;
using BarberSimulator.Haircut;
using UnityEditor;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// More customer variety on top of Phase 2: four dialogue voices and ten extra customer profiles that favour the
    /// newer hairstyles. The tutorial customer is not touched. Called at the end of <see cref="Phase2ContentBuilder.Build"/>
    /// so the profiles are appended to the same spawn config.
    /// </summary>
    public static class CustomerVarietyBuilder
    {
        private const string Folder = GeneratorPaths.ScriptableObjects + "/";

        private static CustomerDialogueSet Voice(string voice)
        {
            var set = ContentAssetsBuilder.GetOrCreate<CustomerDialogueSet>(Folder + "Customers/CustomerDialogue_" + voice + ".asset");
            string p = "cust." + voice + ".";
            set.greetings = Phase2ContentBuilder.Keys(p + "greet", 4);
            set.afterAgree = Phase2ContentBuilder.Keys(p + "agree", 3);
            set.afterWait = Phase2ContentBuilder.Keys(p + "wait_ok", 3);
            set.waitingForChair = Phase2ContentBuilder.Keys(p + "waiting", 2);
            set.reactionGreat = Phase2ContentBuilder.Keys(p + "react.great", 4);
            set.reactionOkay = Phase2ContentBuilder.Keys(p + "react.okay", 3);
            set.reactionBad = Phase2ContentBuilder.Keys(p + "react.bad", 3);
            set.leaveImpatient = Phase2ContentBuilder.Keys(p + "leave", 3);
            set.thanks = Phase2ContentBuilder.Keys(p + "thanks", 3);
            set.replyAgree = Phase2ContentBuilder.Keys(p + "reply.agree", 3);
            set.replyWait = Phase2ContentBuilder.Keys(p + "reply.wait", 3);
            set.smallTalk = Phase2ContentBuilder.Keys(p + "smalltalk", 5);
            EditorUtility.SetDirty(set);
            return set;
        }

        public static void Extend(Phase2ContentBuilder.Result result)
        {
            var casual = Voice("casual");
            var formal = Voice("formal");
            var gruff = Voice("gruff");
            var chatty = Voice("chatty");

            HaircutRequest[] R(params string[] ids) =>
                ids.Select(id => result.Requests.Find(r => r.RequestId == id)).Where(r => r != null).ToArray();
            HaircutRequest One(string id) => result.Requests.Find(r => r.RequestId == id);

            // id, personality, names, patience s, budget, tip chance, leniency, review strictness, requests, favourite, voice, spawn weight
            var added = new List<CustomerProfile>
            {
                P("student", CustomerPersonality.Relaxed, new[] { "Finn", "Elias", "Mateo", "Lukas" }, 240f, 0.85f, 0.35f, 1.15f, 0.8f,
                    R("buzz_cut", "short_trim", "crew_cut", "basic_taper", "undercut"), One("crew_cut"), casual, 0.8f),
                P("businessman", CustomerPersonality.Picky, new[] { "Robert", "Stefan", "Thomas", "Martin" }, 150f, 1.4f, 0.7f, 0.9f, 1.2f,
                    R("short_trim", "basic_taper", "side_part_taper", "crew_cut", "scissor_cut"), One("side_part_taper"), formal, 0.6f),
                P("creative", CustomerPersonality.Friendly, new[] { "Oskar", "Theo", "Milo", "Jonte" }, 210f, 1.15f, 0.6f, 1f, 1f,
                    R("undercut", "mid_fade", "high_fade", "side_part_taper", "low_fade"), One("undercut"), chatty, 0.6f),
                P("athlete", CustomerPersonality.Impatient, new[] { "Jake", "Tyler", "Marvin", "Dario" }, 110f, 1f, 0.5f, 1f, 1.05f,
                    R("buzz_cut", "crew_cut", "low_fade", "mid_fade", "high_fade"), One("high_fade"), casual, 0.6f),
                P("retiree", CustomerPersonality.Relaxed, new[] { "Walter", "Heinz", "George", "Albert" }, 320f, 0.9f, 0.25f, 1.2f, 0.7f,
                    R("short_trim", "scissor_cut", "basic_taper", "side_part_taper"), One("scissor_cut"), formal, 0.55f),
                P("trendsetter", CustomerPersonality.Picky, new[] { "Leo", "Damian", "Nico", "Zayn" }, 170f, 1.5f, 0.75f, 0.8f, 1.3f,
                    R("skin_fade", "high_fade", "undercut", "mid_fade"), One("skin_fade"), casual, 0.4f),
                P("dad", CustomerPersonality.Friendly, new[] { "Mike", "Andreas", "Frank", "Carsten" }, 200f, 1f, 0.55f, 1.05f, 0.9f,
                    R("short_trim", "buzz_cut", "crew_cut", "basic_taper", "scissor_cut"), One("short_trim"), chatty, 0.7f),
                P("night_owl", CustomerPersonality.Quiet, new[] { "Viktor", "Samir", "Emre", "Ilja" }, 230f, 1f, 0.4f, 1f, 1f,
                    R("mid_fade", "low_fade", "crew_cut", "high_fade", "skin_fade"), One("mid_fade"), gruff, 0.5f),
                P("tourist", CustomerPersonality.Friendly, new[] { "Ethan", "Hugo", "Jamal", "Anders" }, 260f, 1.2f, 0.8f, 1.1f, 0.85f,
                    R("basic_taper", "short_trim", "side_part_taper", "scissor_cut", "crew_cut"), One("basic_taper"), chatty, 0.5f),
                P("grump", CustomerPersonality.Impatient, new[] { "Gerd", "Hank", "Boris", "Rolf" }, 100f, 0.9f, 0.15f, 0.9f, 1.3f,
                    R("buzz_cut", "short_trim", "crew_cut", "basic_taper"), One("buzz_cut"), gruff, 0.5f)
            };

            var spawn = result.SpawnConfig;
            if (spawn == null) return;
            var all = new List<CustomerProfile>(spawn.profiles);
            foreach (var profile in added) if (!all.Contains(profile)) all.Add(profile);
            spawn.profiles = all.ToArray();
            EditorUtility.SetDirty(spawn);
        }

        private static CustomerProfile P(string id, CustomerPersonality personality, string[] names, float patience, float budget, float tipChance,
            float leniency, float strictness, HaircutRequest[] requests, HaircutRequest preferred, CustomerDialogueSet dialogue, float weight)
            => Phase2ContentBuilder.Profile(id, personality, names, patience, budget, tipChance, leniency, strictness, requests, preferred, dialogue, false, weight);
    }
}
