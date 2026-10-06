using GuessTheAnswer.Save;
using GuessTheAnswer.Shared;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>Audio, graphics, display and accessibility settings. Every change applies and saves at once.</summary>
    public sealed class SettingsPanel : UIPanel
    {
        ValueSlider master, music, sfx;
        ToggleSwitch mute, fullscreen, fps, haptics;
        Segmented graphics;
        Segmented language;
        float y;

        protected override Vector2 CardSize => new Vector2(1100f, 900f);

        protected override void OnBuild()
        {
            Title("SETTINGS");
            y = -150f;
            master = ValueSlider.Create(Row("MASTER VOLUME"), 1f, v => App.Settings.SetMaster(v), new Vector2(520f, 56f));
            music = ValueSlider.Create(Row("MUSIC VOLUME"), 1f, v => App.Settings.SetMusic(v), new Vector2(520f, 56f));
            sfx = ValueSlider.Create(Row("SFX VOLUME"), 1f, v => App.Settings.SetSfx(v), new Vector2(520f, 56f));
            mute = ToggleSwitch.Create(Row("MUTE"), false, on => App.Settings.SetMuted(on));
            graphics = Segmented.Create(Row("GRAPHICS"), new[] { "LOW", "MEDIUM", "HIGH" }, 2, i => App.Settings.SetGraphics((GraphicsQuality)i), new Vector2(520f, 70f));
            fullscreen = ToggleSwitch.Create(Row("FULLSCREEN"), false, on => App.Settings.SetFullscreen(on));
            // Only English for now; the list grows when translations are added.
            language = Segmented.Create(Row("LANGUAGE"), new[] { "ENGLISH" }, 0, _ => App.Settings.SetLanguage("en"), new Vector2(260f, 70f));
            fps = ToggleSwitch.Create(Row("SHOW FPS"), false, on => App.Settings.SetShowFps(on));
            haptics = ToggleSwitch.Create(Row("VIBRATION"), true, on => App.Settings.SetHaptics(on));
        }

        /// <summary>Adds a labelled row and returns the right-aligned slot for its control.</summary>
        RectTransform Row(string label)
        {
            var l = UIFactory.Label(Card, label, Theme.Body, Theme.Text, Theme.SemiBold, TextAnchor.MiddleLeft);
            UIFactory.Place(l.rectTransform, new Vector2(0f, 1f), new Vector2(80f, y), new Vector2(400f, 72f), new Vector2(0f, 1f));
            var slot = UIFactory.Rect(label + " Control", Card);
            UIFactory.Place(slot, new Vector2(1f, 1f), new Vector2(-80f, y - 36f), new Vector2(0f, 0f), new Vector2(1f, 0.5f));
            y -= 78f;
            return slot;
        }

        public override void OnOpen(object argument)
        {
            var s = App.Settings;
            master.SetValue(s.MasterVolume, false);
            music.SetValue(s.MusicVolume, false);
            sfx.SetValue(s.SfxVolume, false);
            mute.Set(s.Muted, false, true);
            graphics.SetSelected((int)s.Graphics, false);
            fullscreen.Set(s.Fullscreen, false, true);
            language.SetSelected(0, false);
            fps.Set(s.ShowFps, false, true);
            haptics.Set(s.Haptics, false, true);
            AlignRight(master.transform, 520f);
            AlignRight(music.transform, 520f);
            AlignRight(sfx.transform, 520f);
            AlignRight(graphics.transform, 520f);
            AlignRight(language.transform, 260f);
            foreach (var t in new Component[] { mute, fullscreen, fps, haptics }) AlignRight(t.transform, 96f);
        }

        static void AlignRight(Transform t, float width)
        {
            var rt = (RectTransform)t;
            rt.anchorMin = rt.anchorMax = new Vector2(1f, 0.5f);
            rt.pivot = new Vector2(1f, 0.5f);
            rt.anchoredPosition = Vector2.zero;
            rt.sizeDelta = new Vector2(width, rt.sizeDelta.y);
        }

        public override void OnClose()
        {
            App.Save.Flush();
        }
    }

    /// <summary>Nickname, avatar colour and basic statistics.</summary>
    public sealed class ProfilePanel : UIPanel
    {
        InputField nameField;
        Avatar bigAvatar;
        readonly Image[] swatches = new Image[8];
        Text[] statValues;
        int avatar;

        protected override Vector2 CardSize => new Vector2(1100f, 820f);

        protected override void OnBuild()
        {
            Title("PROFILE");

            bigAvatar = Avatar.Create(Card, 170f);
            UIFactory.Place((RectTransform)bigAvatar.transform, new Vector2(0f, 1f), new Vector2(90f, -150f), new Vector2(170f, 170f), new Vector2(0f, 1f));

            var nameLabel = UIFactory.Label(Card, "NICKNAME", Theme.Small, Theme.TextMuted, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Place(nameLabel.rectTransform, new Vector2(0f, 1f), new Vector2(310f, -150f), new Vector2(400f, 40f), new Vector2(0f, 1f));
            nameField = CreateInput(Card);
            UIFactory.Place((RectTransform)nameField.transform, new Vector2(0f, 1f), new Vector2(310f, -196f), new Vector2(560f, 92f), new Vector2(0f, 1f));
            nameField.onValueChanged.AddListener(v => bigAvatar.Set(v, avatar));

            var dice = GameButton.IconButton(Card, "casino", 92f);
            UIFactory.Place((RectTransform)dice.transform, new Vector2(0f, 1f), new Vector2(890f, -196f), new Vector2(92f, 92f), new Vector2(0f, 1f));
            dice.OnClick = () => nameField.text = PlayerNames.Random(XorShiftRandom.FromTime());

            var colorLabel = UIFactory.Label(Card, "COLOUR", Theme.Small, Theme.TextMuted, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Place(colorLabel.rectTransform, new Vector2(0f, 1f), new Vector2(90f, -350f), new Vector2(400f, 40f), new Vector2(0f, 1f));
            for (int i = 0; i < swatches.Length; i++)
            {
                int index = i;
                var b = GameButton.Create(Card, null, ButtonStyle.Secondary, new Vector2(84f, 84f), null, Theme.Body, 42f, false);
                UIFactory.Place((RectTransform)b.transform, new Vector2(0f, 1f), new Vector2(90f + i * 110f, -400f), new Vector2(84f, 84f), new Vector2(0f, 1f));
                b.SetColors(Theme.AvatarColor(i), Color.white);
                var ring = UIFactory.Image(b.transform, "Selected", Color.white, Shapes.Ring);
                UIFactory.Stretch(ring.rectTransform, -10f, -10f, -10f, -10f);
                swatches[i] = ring;
                b.OnClick = () => SelectAvatar(index);
            }

            string[] stats = { "MATCHES", "WINS", "ACCURACY", "BEST STREAK", "LEVEL" };
            statValues = new Text[stats.Length];
            for (int i = 0; i < stats.Length; i++)
            {
                var tile = UIFactory.Panel(Card, "Stat", Theme.Surface, Theme.Radius);
                UIFactory.Place(tile.rectTransform, new Vector2(0f, 0f), new Vector2(90f + i * 188f, 80f), new Vector2(168f, 150f), new Vector2(0f, 0f));
                statValues[i] = UIFactory.Label(tile.rectTransform, "0", Theme.H2, Theme.Text, Theme.Bold);
                UIFactory.Stretch(statValues[i].rectTransform, 6f, 20f, 6f, 54f);
                var l = UIFactory.Label(tile.rectTransform, stats[i], Theme.Tiny, Theme.TextMuted, Theme.Bold);
                UIFactory.Stretch(l.rectTransform, 6f, 96f, 6f, 16f);
            }
        }

        static InputField CreateInput(Transform parent)
        {
            var bg = UIFactory.Panel(parent, "Nickname", Theme.Surface, Theme.Radius, raycast: true);
            var field = bg.gameObject.AddComponent<InputField>();
            var text = UIFactory.Label(bg.rectTransform, "", Theme.H3, Theme.Text, Theme.Bold, TextAnchor.MiddleLeft, "Text");
            UIFactory.Stretch(text.rectTransform, 28f, 0f, 28f, 0f);
            text.supportRichText = false;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            var placeholder = UIFactory.Label(bg.rectTransform, "Enter a nickname", Theme.H3, Theme.TextFaint, Theme.Medium, TextAnchor.MiddleLeft, "Placeholder");
            UIFactory.Stretch(placeholder.rectTransform, 28f, 0f, 28f, 0f);
            field.textComponent = text;
            field.placeholder = placeholder;
            field.characterLimit = PlayerNames.MaxLength;
            field.lineType = InputField.LineType.SingleLine;
            field.caretColor = Theme.Accent;
            field.selectionColor = new Color(1f, 0.78f, 0.24f, 0.35f);
            field.targetGraphic = bg;
            field.onValidateInput = (s, i, c) => char.IsLetterOrDigit(c) || c == ' ' || c == '_' || c == '-' ? c : '\0';
            return field;
        }

        void SelectAvatar(int index)
        {
            avatar = index;
            for (int i = 0; i < swatches.Length; i++) swatches[i].enabled = i == index;
            bigAvatar.Set(nameField.text, avatar);
            Tween.Punch(bigAvatar.transform, 0.08f, 0.25f);
        }

        public override void OnOpen(object argument)
        {
            var data = App.Save.Data;
            nameField.text = data.nickname;
            SelectAvatar(data.avatar);
            var st = data.stats;
            statValues[0].text = st.matchesPlayed.ToString();
            statValues[1].text = st.wins.ToString();
            statValues[2].text = st.answers > 0 ? Mathf.RoundToInt(100f * st.correctAnswers / st.answers) + "%" : "-";
            statValues[3].text = st.bestStreak.ToString();
            statValues[4].text = data.profile.level.ToString();
        }

        public override void OnClose()
        {
            string name = PlayerNames.Sanitize(nameField.text);
            App.SetProfile(name, avatar);
            App.Save.Flush();
            if (UI.Current is MainMenuScreen menu) menu.OnShow(null);
        }
    }
}
