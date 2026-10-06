using GuessTheAnswer.Audio;
using GuessTheAnswer.Multiplayer;
using GuessTheAnswer.Shared;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>
    /// Main menu: PLAY (quick 1v1), PUBLIC GAME, PRIVATE GAME, PRACTICE, plus profile, sound and settings.
    /// The right side shows a live-looking question card so new players see the game at a glance.
    /// </summary>
    public sealed class MainMenuScreen : UIScreen
    {
        RectTransform[] entrance;
        Avatar profileAvatar;
        Text profileName;
        Text profileLevel;
        Image statusDot;
        Text statusText;
        GameButton soundButton;
        RectTransform preview;
        float time;

        protected override void OnBuild()
        {
            var logo = Logo.Create(Root, 0.9f);
            UIFactory.Place(logo, new Vector2(0f, 1f), new Vector2(110f, -70f), logo.sizeDelta, new Vector2(0f, 1f));

            var play = MenuCard.Create(Root, "PLAY", "QUICK MATCH · 1V1", "play_arrow", ButtonStyle.Primary, new Vector2(760f, 200f), Theme.H1);
            UIFactory.Place((RectTransform)play.transform, new Vector2(0f, 1f), new Vector2(120f, -330f), new Vector2(760f, 200f), new Vector2(0f, 1f));
            play.OnClick = () => App.Flow.StartPublic(QueueKind.OneVsOne);

            var pub = MenuCard.Create(Root, "PUBLIC GAME", "1V1 OR 2V2", "groups", ButtonStyle.Secondary, new Vector2(370f, 170f));
            UIFactory.Place((RectTransform)pub.transform, new Vector2(0f, 1f), new Vector2(120f, -556f), new Vector2(370f, 170f), new Vector2(0f, 1f));
            pub.OnClick = () => UI.OpenPanel<PublicModePanel>();

            var priv = MenuCard.Create(Root, "PRIVATE GAME", "PLAY WITH FRIENDS", "lock", ButtonStyle.Secondary, new Vector2(370f, 170f));
            UIFactory.Place((RectTransform)priv.transform, new Vector2(0f, 1f), new Vector2(510f, -556f), new Vector2(370f, 170f), new Vector2(0f, 1f));
            priv.OnClick = () => UI.Show<PrivateScreen>();

            var practice = MenuCard.Create(Root, "PRACTICE", "SOLO VS BOTS · WORKS OFFLINE", "smart_toy", ButtonStyle.Ghost, new Vector2(760f, 130f), Theme.H3);
            UIFactory.Place((RectTransform)practice.transform, new Vector2(0f, 1f), new Vector2(120f, -752f), new Vector2(760f, 130f), new Vector2(0f, 1f));
            practice.OnClick = () => App.Flow.StartPractice();

            preview = BuildPreview();

            // Profile chip (top right).
            var profile = GameButton.Create(Root, null, ButtonStyle.Secondary, new Vector2(420f, 104f), null, Theme.Body, 52f);
            var prt = (RectTransform)profile.transform;
            UIFactory.Place(prt, new Vector2(1f, 1f), new Vector2(-60f, -50f), new Vector2(420f, 104f), new Vector2(1f, 1f));
            profileAvatar = Avatar.Create(prt, 76f);
            UIFactory.Place((RectTransform)profileAvatar.transform, new Vector2(0f, 0.5f), new Vector2(14f, 0f), new Vector2(76f, 76f), new Vector2(0f, 0.5f));
            profileName = UIFactory.Label(prt, "", Theme.Body, Theme.Text, Theme.Bold, TextAnchor.LowerLeft);
            UIFactory.Stretch(profileName.rectTransform, 108f, 10f, 64f, 52f);
            profileLevel = UIFactory.Label(prt, "", Theme.Tiny, Theme.TextMuted, Theme.Medium, TextAnchor.UpperLeft);
            UIFactory.Stretch(profileLevel.rectTransform, 108f, 54f, 64f, 8f);
            var edit = UIFactory.Icon(prt, "edit", 36f, Theme.TextMuted);
            UIFactory.Place(edit.rectTransform, new Vector2(1f, 0.5f), new Vector2(-24f, 0f), new Vector2(36f, 36f), new Vector2(1f, 0.5f));
            profile.OnClick = () => UI.OpenPanel<ProfilePanel>();

            // Connection status under the profile chip.
            statusDot = UIFactory.Image(Root, "Status Dot", Theme.TextFaint, Shapes.Circle);
            UIFactory.Place(statusDot.rectTransform, new Vector2(1f, 1f), new Vector2(-250f, -184f), new Vector2(14f, 14f), new Vector2(0.5f, 0.5f));
            statusText = UIFactory.Label(Root, "", Theme.Tiny, Theme.TextMuted, Theme.SemiBold, TextAnchor.MiddleLeft);
            UIFactory.Place(statusText.rectTransform, new Vector2(1f, 1f), new Vector2(-232f, -184f), new Vector2(180f, 30f), new Vector2(0f, 0.5f));

            // Sound and settings (bottom right).
            soundButton = GameButton.IconButton(Root, "volume_up", 96f);
            UIFactory.Place((RectTransform)soundButton.transform, new Vector2(1f, 0f), new Vector2(-180f, 56f), new Vector2(96f, 96f), new Vector2(1f, 0f));
            soundButton.OnClick = () =>
            {
                App.Settings.ToggleMute();
                RefreshSound();
            };
            var settings = GameButton.IconButton(Root, "settings", 96f);
            UIFactory.Place((RectTransform)settings.transform, new Vector2(1f, 0f), new Vector2(-60f, 56f), new Vector2(96f, 96f), new Vector2(1f, 0f));
            settings.OnClick = () => UI.OpenPanel<SettingsPanel>();

            var version = UIFactory.Label(Root, "v" + Application.version, Theme.Tiny, Theme.TextFaint, Theme.Medium, TextAnchor.LowerLeft);
            UIFactory.Place(version.rectTransform, new Vector2(0f, 0f), new Vector2(120f, 40f), new Vector2(300f, 30f), new Vector2(0f, 0f));

            entrance = new[] { logo, (RectTransform)play.transform, (RectTransform)pub.transform, (RectTransform)priv.transform, (RectTransform)practice.transform, preview };
        }

        RectTransform BuildPreview()
        {
            var card = UIFactory.Panel(Root, "Preview", Theme.Surface, Theme.RadiusLarge);
            var rt = card.rectTransform;
            UIFactory.Place(rt, new Vector2(1f, 0.5f), new Vector2(-150f, -40f), new Vector2(700f, 500f), new Vector2(1f, 0.5f));
            rt.localRotation = Quaternion.Euler(0f, 0f, -3f);
            UIFactory.Shadow(rt, 30f, -16f, 0.5f);
            UIFactory.Outline(rt, new Color(1f, 1f, 1f, 0.06f), Theme.RadiusLarge);

            var chip = UIFactory.Panel(rt, "Category", new Color(0.24f, 0.76f, 1f, 0.16f), 22f);
            UIFactory.Place(chip.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -40f), new Vector2(260f, 52f), new Vector2(0.5f, 1f));
            var chipIcon = UIFactory.Icon(chip.rectTransform, "public", 30f, Theme.Hex("#3DC2FF"));
            UIFactory.Place(chipIcon.rectTransform, new Vector2(0f, 0.5f), new Vector2(22f, 0f), new Vector2(30f, 30f), new Vector2(0f, 0.5f));
            var chipText = UIFactory.Label(chip.rectTransform, "COUNTRIES", Theme.Small, Theme.Hex("#3DC2FF"), Theme.Bold);
            UIFactory.Stretch(chipText.rectTransform, 50f, 0f, 10f, 0f);

            var q = UIFactory.Label(rt, "Which country has the largest population?", Theme.H3, Theme.Text, Theme.Bold);
            UIFactory.Place(q.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -120f), new Vector2(600f, 110f), new Vector2(0.5f, 1f));

            string[] answers = { "CHINA", "INDIA", "USA", "INDONESIA" };
            for (int i = 0; i < 4; i++)
            {
                bool correct = i == 1;
                var a = UIFactory.Panel(rt, "Answer", correct ? Theme.Success : Theme.SurfaceRaised, 18f);
                float x = i % 2 == 0 ? -152f : 152f;
                float y = i < 2 ? 150f : 50f;
                UIFactory.Place(a.rectTransform, new Vector2(0.5f, 0f), new Vector2(x, y), new Vector2(288f, 84f), new Vector2(0.5f, 0f));
                var letter = UIFactory.Label(a.rectTransform, ((char)('A' + i)).ToString(), Theme.Body, correct ? Theme.TextOnAccent : Theme.Accent, Theme.Bold, TextAnchor.MiddleLeft);
                UIFactory.Stretch(letter.rectTransform, 24f, 0f, 0f, 0f);
                var text = UIFactory.Label(a.rectTransform, answers[i], Theme.Small, correct ? Theme.TextOnAccent : Theme.Text, Theme.Bold, TextAnchor.MiddleLeft);
                UIFactory.Stretch(text.rectTransform, 62f, 0f, 10f, 0f);
            }
            return rt;
        }

        public override void OnShow(object argument)
        {
            var save = App.Save.Data;
            profileAvatar.Set(save.nickname, save.avatar);
            profileName.text = save.nickname;
            profileLevel.text = "LEVEL " + save.profile.level + " · " + save.stats.wins + " WINS";
            RefreshSound();
            RefreshStatus(App.Net.OnlineStatus);
            App.Flow.ConnectionChanged -= RefreshStatus;
            App.Flow.ConnectionChanged += RefreshStatus;

            for (int i = 0; i < entrance.Length; i++)
            {
                var rt = entrance[i];
                var group = UIFactory.Group(rt);
                group.alpha = 0f;
                Tween.Fade(group, 1f, 0.35f, Ease.OutCubic, 0.05f + i * 0.05f);
                Tween.ScaleFrom(rt, 0.94f, 1f, 0.4f, Ease.OutBack, 0.05f + i * 0.05f);
            }
        }

        public override void OnHide()
        {
            App.Flow.ConnectionChanged -= RefreshStatus;
        }

        void RefreshSound()
        {
            if (soundButton.IconImage != null) soundButton.IconImage.sprite = Shapes.Icon(App.Settings.Muted ? "volume_off" : "volume_up");
        }

        void RefreshStatus(ConnectionStatus status)
        {
            switch (status)
            {
                case ConnectionStatus.Connected:
                    statusDot.color = Theme.Success;
                    statusText.text = "ONLINE";
                    break;
                case ConnectionStatus.Connecting:
                case ConnectionStatus.Reconnecting:
                    statusDot.color = Theme.Accent;
                    statusText.text = "CONNECTING...";
                    break;
                default:
                    statusDot.color = Theme.Danger;
                    statusText.text = "OFFLINE";
                    break;
            }
        }

        void Update()
        {
            if (preview == null) return;
            time += Time.unscaledDeltaTime;
            preview.anchoredPosition = new Vector2(-150f, -40f + Mathf.Sin(time * 0.9f) * 10f);
        }

        public override bool OnBack() => false;

        public override void OnKey(KeyCode key)
        {
            if (key == KeyCode.Return || key == KeyCode.Space) App.Flow.StartPublic(QueueKind.OneVsOne);
        }
    }

    /// <summary>Choose 1V1 or 2V2 for public matchmaking.</summary>
    public sealed class PublicModePanel : UIPanel
    {
        protected override Vector2 CardSize => new Vector2(1000f, 560f);

        protected override void OnBuild()
        {
            Title("PUBLIC GAME");
            var sub = UIFactory.Label(Card, "Get matched with players from around the world.", Theme.Body, Theme.TextMuted, Theme.Medium);
            UIFactory.Place(sub.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -130f), new Vector2(900f, 50f), new Vector2(0.5f, 1f));

            var one = MenuCard.Create(Card, "1V1", "YOU AGAINST ONE PLAYER", "person", ButtonStyle.Primary, new Vector2(420f, 220f), Theme.H1);
            UIFactory.Place((RectTransform)one.transform, new Vector2(0.5f, 0f), new Vector2(-225f, 90f), new Vector2(420f, 220f), new Vector2(0.5f, 0f));
            one.OnClick = () => { Close(); App.Flow.StartPublic(QueueKind.OneVsOne); };

            var two = MenuCard.Create(Card, "2V2", "TEAM UP WITH A PARTNER", "groups", ButtonStyle.Secondary, new Vector2(420f, 220f), Theme.H1);
            UIFactory.Place((RectTransform)two.transform, new Vector2(0.5f, 0f), new Vector2(225f, 90f), new Vector2(420f, 220f), new Vector2(0.5f, 0f));
            two.OnClick = () => { Close(); App.Flow.StartPublic(QueueKind.TwoVsTwo); };
        }

        public override void OnKey(KeyCode key)
        {
            if (key == KeyCode.Alpha1) { Close(); App.Flow.StartPublic(QueueKind.OneVsOne); }
            else if (key == KeyCode.Alpha2) { Close(); App.Flow.StartPublic(QueueKind.TwoVsTwo); }
        }
    }
}
