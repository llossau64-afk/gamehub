using System.Collections.Generic;
using BarberSimulator.Audio;
using BarberSimulator.Core;
using BarberSimulator.Dialogue;
using BarberSimulator.Objectives;
using BarberSimulator.UI;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace BarberSimulator.EditorTools
{
    /// <summary>Creates the data assets: UI theme, sound library, dialogue, objectives, post-processing and the GameConfig.</summary>
    public static class ContentAssetsBuilder
    {
        public sealed class Result
        {
            public GameConfig Config;
            public VolumeProfile PostProcessing;
            public Phase2ContentBuilder.Result Phase2;
            public Phase3ContentBuilder.Result Phase3;
        }

        public static Result Build()
        {
            var theme = BuildTheme();
            var sounds = BuildSounds();
            var dialogue = BuildIntroDialogue();
            var objectives = BuildObjectives();
            var phase3 = Phase3ContentBuilder.Build();

            var config = AssetDatabase.LoadAssetAtPath<GameConfig>(GeneratorPaths.GameConfig);
            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GameConfig>();
                AssetUtility.EnsureFolder(GeneratorPaths.ScriptableObjects);
                AssetDatabase.CreateAsset(config, GeneratorPaths.GameConfig);
            }
            config.uiTheme = theme;
            config.sounds = sounds;
            config.introConversation = dialogue;
            config.objectives = objectives;
            config.workday = phase3.Workday;
            config.upgrades = phase3.Catalog;
            config.versionLabel = "v" + PlayerSettings.bundleVersion;
            EditorUtility.SetDirty(config);

            var result = new Result { Config = config, PostProcessing = BuildPostProcessing(), Phase2 = Phase2ContentBuilder.Build(sounds), Phase3 = phase3 };
            AssetDatabase.SaveAssets();
            return result;
        }

        public static T GetOrCreate<T>(string path) where T : ScriptableObject
        {
            var asset = AssetDatabase.LoadAssetAtPath<T>(path);
            if (asset != null) return asset;
            asset = ScriptableObject.CreateInstance<T>();
            AssetUtility.EnsureFolder(System.IO.Path.GetDirectoryName(path));
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        private static UITheme BuildTheme()
        {
            var theme = GetOrCreate<UITheme>(GeneratorPaths.ScriptableObjects + "/UI/UITheme.asset");
            theme.displayFont = AssetUtility.Font("DMSerifDisplay-Regular.ttf");
            theme.bodyFont = AssetUtility.Font("Inter-Regular.ttf");
            theme.mediumFont = AssetUtility.Font("Inter-Medium.ttf");
            theme.semiBoldFont = AssetUtility.Font("Inter-SemiBold.ttf");
            theme.roundedRect = AssetUtility.Sprite("rounded_rect.png");
            theme.circleSolid = AssetUtility.Sprite("circle_solid.png");
            theme.circleSoft = AssetUtility.Sprite("circle_soft.png");
            theme.gradientLeft = AssetUtility.Sprite("gradient_left.png");
            theme.gradientBottom = AssetUtility.Sprite("gradient_bottom.png");
            theme.vignette = AssetUtility.Sprite("vignette.png");
            theme.joystickRing = AssetUtility.Sprite("joystick_ring.png");
            theme.joystickKnob = AssetUtility.Sprite("joystick_knob.png");
            theme.crosshairDot = AssetUtility.Sprite("crosshair_dot.png");
            theme.iconHand = AssetUtility.Sprite("icon_hand.png");
            theme.iconPause = AssetUtility.Sprite("icon_pause.png");
            theme.iconGear = AssetUtility.Sprite("icon_gear.png");
            theme.iconCheck = AssetUtility.Sprite("icon_check.png");
            theme.iconScissors = AssetUtility.Sprite("icon_scissors.png");
            theme.iconStar = AssetUtility.Sprite("icon_star.png");
            EditorUtility.SetDirty(theme);
            return theme;
        }

        private static SoundLibrary BuildSounds()
        {
            var s = GetOrCreate<SoundLibrary>(GeneratorPaths.ScriptableObjects + "/Audio/SoundLibrary.asset");
            s.menuMusic = AssetUtility.Clip("Music/menu_music.wav");
            s.shopAmbience = AssetUtility.Clip("Ambience/shop_ambience.wav");
            s.streetAmbience = AssetUtility.Clip("Ambience/street_ambience.wav");
            s.uiHover = AssetUtility.Clip("UI/ui_hover.wav");
            s.uiClick = AssetUtility.Clip("UI/ui_click.wav");
            s.uiBack = AssetUtility.Clip("UI/ui_back.wav");
            s.uiWhoosh = AssetUtility.Clip("UI/ui_whoosh.wav");
            s.uiToast = AssetUtility.Clip("UI/ui_toast.wav");
            s.doorUnlock = AssetUtility.Clip("SFX/door_unlock.wav");
            s.doorOpen = AssetUtility.Clip("SFX/door_open.wav");
            s.doorClose = AssetUtility.Clip("SFX/door_close.wav");
            s.doorBell = AssetUtility.Clip("SFX/door_bell.wav");
            s.keysJingle = AssetUtility.Clip("SFX/keys_jingle.wav");
            s.footsteps = new[]
            {
                AssetUtility.Clip("SFX/footstep_01.wav"), AssetUtility.Clip("SFX/footstep_02.wav"),
                AssetUtility.Clip("SFX/footstep_03.wav"), AssetUtility.Clip("SFX/footstep_04.wav")
            };
            s.trashPickup = AssetUtility.Clip("SFX/trash_pickup.wav");
            s.objectiveComplete = AssetUtility.Clip("SFX/objective_complete.wav");
            s.inspectTools = AssetUtility.Clip("SFX/inspect_tools.wav");
            s.clipperBuzz = AssetUtility.Clip("SFX/clipper_buzz.wav");
            s.clipperStart = AssetUtility.Clip("SFX/clipper_start.wav");
            s.clipperLoop = AssetUtility.Clip("SFX/clipper_loop.wav");
            s.clipperCuttingLoop = AssetUtility.Clip("SFX/clipper_cutting_loop.wav");
            s.clipperStop = AssetUtility.Clip("SFX/clipper_stop.wav");
            s.trimmerLoop = AssetUtility.Clip("SFX/trimmer_loop.wav");
            s.scissorSnips = new[]
            {
                AssetUtility.Clip("SFX/scissor_snip_01.wav"), AssetUtility.Clip("SFX/scissor_snip_02.wav"),
                AssetUtility.Clip("SFX/scissor_snip_03.wav"), AssetUtility.Clip("SFX/scissor_snip_04.wav")
            };
            s.combStrokes = new[] { AssetUtility.Clip("SFX/comb_01.wav"), AssetUtility.Clip("SFX/comb_02.wav") };
            s.hairFall = AssetUtility.Clip("SFX/hair_fall.wav");
            s.uiToolSelect = AssetUtility.Clip("UI/ui_tool_select.wav");
            s.chairCreak = AssetUtility.Clip("SFX/chair_creak.wav");
            s.clothSit = AssetUtility.Clip("SFX/cloth_sit.wav");
            s.clothStand = AssetUtility.Clip("SFX/cloth_stand.wav");
            s.capeSnap = AssetUtility.Clip("SFX/cape_snap.wav");
            s.cashRegister = AssetUtility.Clip("SFX/cash_register.wav");
            s.coins = AssetUtility.Clip("SFX/coins.wav");
            s.reviewGood = AssetUtility.Clip("SFX/review_good.wav");
            s.reviewBad = AssetUtility.Clip("SFX/review_bad.wav");
            EditorUtility.SetDirty(s);
            return s;
        }

        private static DialogueConversation BuildIntroDialogue()
        {
            string folder = GeneratorPaths.ScriptableObjects + "/Dialogue/";
            var owner = GetOrCreate<SpeakerDefinition>(folder + "Speaker_PreviousOwner.asset");
            owner.Configure("previous_owner", "speaker.owner", new Color(0.86f, 0.71f, 0.45f), false);
            EditorUtility.SetDirty(owner);
            var player = GetOrCreate<SpeakerDefinition>(folder + "Speaker_Player.asset");
            player.Configure("player", "speaker.player", new Color(0.72f, 0.78f, 0.8f), true);
            EditorUtility.SetDirty(player);

            owner.SetPortrait(AssetUtility.Sprite("portrait_owner.png"));
            player.SetPortrait(AssetUtility.Sprite("portrait_player.png"));

            // The arrival conversation; IntroSequence plays it in beats (see the index constants there).
            DialogueLine O(int n, float pause = 0.35f, string gesture = null) => new DialogueLine { speaker = owner, textKey = "dialogue.intro." + n, pauseAfter = pause, animationTrigger = gesture };
            DialogueLine P(int n, float pause = 0.4f) => new DialogueLine { speaker = player, textKey = "dialogue.intro." + n, pauseAfter = pause };
            var lines = new List<DialogueLine>
            {
                O(1, 0.4f, "gesture"), P(2), O(3, 0.5f), P(4), O(5, 0.6f), O(6, 0.45f, "gesture"), P(7), O(8, 0.2f),
                O(9, 0.3f, "gesture"),
                O(10, 0.4f, "nod"), P(11, 0.3f), O(12, 0.3f, "nod"),
                O(13, 0.3f), O(14, 0.2f, "gesture"), O(15, 0.3f),
                P(16, 0.2f), P(17, 0.3f)
            };
            var conversation = GetOrCreate<DialogueConversation>(folder + "Conversation_Intro.asset");
            conversation.Configure("intro_day1", lines);
            EditorUtility.SetDirty(conversation);
            return conversation;
        }

        private static ObjectiveSequence BuildObjectives()
        {
            string folder = GeneratorPaths.ScriptableObjects + "/Objectives/";
            var inspect = GetOrCreate<ObjectiveDefinition>(folder + "Objective_InspectShop.asset");
            inspect.Configure("inspect_shop", "objective.inspect", "objective.inspect.hint", ObjectiveSignals.InspectionPointVisited, 3, 0);
            var clean = GetOrCreate<ObjectiveDefinition>(folder + "Objective_CleanShop.asset");
            clean.Configure("clean_shop", "objective.clean", "objective.clean.hint", ObjectiveSignals.TrashCollected, 5, 25);
            var station = GetOrCreate<ObjectiveDefinition>(folder + "Objective_CheckStation.asset");
            station.Configure("check_station", "objective.station", "objective.station.hint", ObjectiveSignals.StationInspected, 1, 0);
            var serve = GetOrCreate<ObjectiveDefinition>(folder + "Objective_ServeFirstCustomer.asset");
            serve.Configure("serve_first_customer", "objective.serve", "objective.serve.hint", ObjectiveSignals.CustomerServed, 1, 0);
            foreach (var o in new[] { inspect, clean, station, serve }) EditorUtility.SetDirty(o);

            var sequence = GetOrCreate<ObjectiveSequence>(folder + "ObjectiveSequence_Day1.asset");
            sequence.Configure(new List<ObjectiveDefinition> { inspect, clean, station, serve }, "objectives.completed");
            EditorUtility.SetDirty(sequence);
            return sequence;
        }

        /// <summary>Restrained grade: neutral tonemap, a touch of warmth and contrast, soft vignette, gentle bloom on bulbs.</summary>
        private static VolumeProfile BuildPostProcessing()
        {
            string path = GeneratorPaths.Settings + "/PostProcessing.asset";
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
            if (profile != null)
            {
                // Rebuild components so regenerating always yields the authored grade.
                foreach (var sub in AssetDatabase.LoadAllAssetRepresentationsAtPath(path))
                    if (sub is VolumeComponent) Object.DestroyImmediate(sub, true);
                profile.components.Clear();
            }
            else
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetUtility.EnsureFolder(GeneratorPaths.Settings);
                AssetDatabase.CreateAsset(profile, path);
            }

            var tonemapping = profile.Add<Tonemapping>(true);
            tonemapping.mode.Override(TonemappingMode.Neutral);

            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.15f);
            color.contrast.Override(10f);
            color.saturation.Override(-6f);
            color.colorFilter.Override(new Color(1f, 0.96f, 0.9f));

            var white = profile.Add<WhiteBalance>(true);
            white.temperature.Override(8f);

            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.24f);
            vignette.smoothness.Override(0.45f);
            vignette.color.Override(new Color(0.08f, 0.05f, 0.03f));

            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.1f);
            bloom.intensity.Override(0.35f);
            bloom.scatter.Override(0.6f);

            foreach (var component in profile.components)
            {
                component.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
                AssetDatabase.AddObjectToAsset(component, profile);
            }
            EditorUtility.SetDirty(profile);
            return profile;
        }
    }
}
