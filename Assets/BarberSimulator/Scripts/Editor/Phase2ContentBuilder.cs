using System.Collections.Generic;
using BarberSimulator.Audio;
using BarberSimulator.Customers;
using BarberSimulator.Haircut;
using UnityEditor;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>Creates the haircut / customer data assets: tools, hairstyle requests, dialogue, profiles, spawning.</summary>
    public static class Phase2ContentBuilder
    {
        public sealed class Result
        {
            public BarberToolDefinition[] Tools;
            public List<HaircutRequest> Requests = new List<HaircutRequest>();
            public CustomerSpawnConfig SpawnConfig;
        }

        private const string Folder = GeneratorPaths.ScriptableObjects + "/";

        public static Result Build(SoundLibrary sounds)
        {
            var result = new Result();

            foreach (var d in HaircutDefaults.All())
            {
                var request = ContentAssetsBuilder.GetOrCreate<HaircutRequest>(Folder + "Haircuts/Haircut_" + d.Id + ".asset");
                request.Configure(d.Id, d.NameKey, d.AskKeys, d.Price, d.Fade, d.TutorialHints, d.Targets);
                EditorUtility.SetDirty(request);
                result.Requests.Add(request);
            }

            result.Tools = new[]
            {
                Tool("basic_clipper", "tool.clipper", BarberToolType.Clipper, "icon_clipper.png", 0, 6.5f, 0.75f, 11f,
                    new[] { 0.05f, 0.15f, 0.3f, 0.6f, 1.0f, 1.3f }, new[] { "#0", "#½", "#1", "#2", "#3", "#4" }, 0.75f,
                    sounds.clipperStart, sounds.clipperLoop, sounds.clipperCuttingLoop, sounds.clipperStop),
                Tool("basic_trimmer", "tool.trimmer", BarberToolType.Trimmer, "icon_trimmer.png", 0, 5f, 0.95f, 6f,
                    new float[0], new string[0], 0.6f, sounds.clipperStart, sounds.trimmerLoop, sounds.clipperCuttingLoop, sounds.clipperStop),
                Tool("basic_scissors", "tool.scissors", BarberToolType.Scissors, "icon_scissors.png", 0, 0f, 0.85f, 12f,
                    new float[0], new string[0], 0.2f, null, null, null, null),
                Tool("basic_comb", "tool.comb", BarberToolType.Comb, "icon_comb.png", 0, 0f, 0.8f, 12f,
                    new float[0], new string[0], 0.1f, null, null, null, null)
            };
            result.Tools[1].minimumLength = 0.05f;
            result.Tools[2].snipAmount = 0.45f;
            result.Tools[2].scissorsFloor = 0.9f;

            var dialogue = ContentAssetsBuilder.GetOrCreate<CustomerDialogueSet>(Folder + "Customers/CustomerDialogue_Default.asset");
            dialogue.greetings = Keys("cust.greet", 4);
            dialogue.afterAgree = Keys("cust.agree", 3);
            dialogue.afterWait = Keys("cust.wait_ok", 3);
            dialogue.waitingForChair = Keys("cust.waiting", 2);
            dialogue.reactionGreat = Keys("cust.react.great", 4);
            dialogue.reactionOkay = Keys("cust.react.okay", 3);
            dialogue.reactionBad = Keys("cust.react.bad", 3);
            dialogue.leaveImpatient = Keys("cust.leave", 3);
            dialogue.thanks = Keys("cust.thanks", 3);
            EditorUtility.SetDirty(dialogue);

            HaircutRequest R(string id) => result.Requests.Find(r => r.RequestId == id);
            var all = result.Requests.ToArray();

            var tutorial = Profile("tutorial_marcus", CustomerPersonality.Friendly, new[] { "Marcus" }, 0f, 1f, 1f, 1.3f, 0.8f,
                new HaircutRequest[0], R("low_fade"), dialogue, true, 0f);
            var relaxed = Profile("relaxed", CustomerPersonality.Relaxed, new[] { "Tom", "Leon", "Sam", "David", "Jonas" }, 260f, 1f, 0.55f, 1.1f, 0.9f, all, null, dialogue, false, 1f);
            var friendly = Profile("friendly", CustomerPersonality.Friendly, new[] { "Ben", "Luca", "Noah", "Marco" }, 220f, 1.05f, 0.7f, 1f, 0.9f, all, R("short_trim"), dialogue, false, 1f);
            var quiet = Profile("quiet", CustomerPersonality.Quiet, new[] { "Paul", "Erik", "Malik" }, 200f, 1f, 0.45f, 1f, 1f, all, R("buzz_cut"), dialogue, false, 0.7f);
            var impatient = Profile("impatient", CustomerPersonality.Impatient, new[] { "Kevin", "Dennis", "Chris" }, 120f, 1.1f, 0.4f, 1f, 1.05f, all, R("mid_fade"), dialogue, false, 0.6f);
            var picky = Profile("picky", CustomerPersonality.Picky, new[] { "Julian", "Felix", "Adrian" }, 200f, 1.2f, 0.6f, 0.85f, 1.25f, all, R("low_fade"), dialogue, false, 0.45f);

            var spawn = ContentAssetsBuilder.GetOrCreate<CustomerSpawnConfig>(Folder + "Customers/CustomerSpawnConfig.asset");
            spawn.tutorialProfile = tutorial;
            spawn.profiles = new[] { relaxed, friendly, quiet, impatient, picky };
            spawn.firstCustomerDelay = 6f;
            spawn.minInterval = 45f;
            spawn.maxInterval = 90f;
            spawn.maxActiveCustomers = 3;
            EditorUtility.SetDirty(spawn);
            result.SpawnConfig = spawn;

            AssetDatabase.SaveAssets();
            return result;
        }

        private static string[] Keys(string prefix, int count)
        {
            var keys = new string[count];
            for (int i = 0; i < count; i++) keys[i] = prefix + "." + (i + 1);
            return keys;
        }

        private static BarberToolDefinition Tool(string id, string nameKey, BarberToolType type, string icon, int price, float speed, float precision,
            float radius, float[] guards, string[] guardLabels, float noise, AudioClip start, AudioClip loop, AudioClip cutting, AudioClip stop)
        {
            var tool = ContentAssetsBuilder.GetOrCreate<BarberToolDefinition>(Folder + "Tools/Tool_" + id + ".asset");
            tool.toolId = id;
            tool.nameKey = nameKey;
            tool.type = type;
            tool.icon = AssetUtility.Sprite(icon);
            tool.price = price;
            tool.ownedByDefault = true;
            tool.cutSpeed = speed;
            tool.precision = precision;
            tool.brushRadius = radius;
            tool.guardLengths = guards;
            tool.guardLabels = guardLabels;
            tool.noise = noise;
            tool.startClip = start;
            tool.loopClip = loop;
            tool.cuttingLayerClip = cutting;
            tool.stopClip = stop;
            EditorUtility.SetDirty(tool);
            return tool;
        }

        private static CustomerProfile Profile(string id, CustomerPersonality personality, string[] names, float patience, float budget, float tipChance,
            float leniency, float strictness, HaircutRequest[] requests, HaircutRequest preferred, CustomerDialogueSet dialogue, bool tutorial, float weight)
        {
            var profile = ContentAssetsBuilder.GetOrCreate<CustomerProfile>(Folder + "Customers/Profile_" + id + ".asset");
            profile.profileId = id;
            profile.personality = personality;
            profile.firstNames = names;
            profile.patienceSeconds = patience;
            profile.budget = budget;
            profile.tipChance = tipChance;
            profile.leniency = leniency;
            profile.reviewStrictness = strictness;
            profile.possibleRequests = requests;
            profile.preferredRequest = preferred;
            profile.dialogue = dialogue;
            profile.isTutorial = tutorial;
            profile.spawnWeight = weight;
            EditorUtility.SetDirty(profile);
            return profile;
        }
    }
}
