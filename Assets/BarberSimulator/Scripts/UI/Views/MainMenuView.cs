using System;
using System.Collections;
using BarberSimulator.Audio;
using BarberSimulator.Settings;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// The main menu: logo and navigation in a left column, the live 3D shop on the right (only a soft shade sits on
    /// the left edge). PLAY (no save) or CONTINUE (save, with "Day 3 · $420") is the primary action, then NEW GAME,
    /// SETTINGS, ACHIEVEMENTS, HOW TO PLAY, CREDITS and EXIT (desktop builds only). Panels and the new-game
    /// confirmation open inside the menu with a short fade and slide; the buttons are uGUI Selectables, so mouse,
    /// touch, keyboard and gamepad all work.
    /// </summary>
    public sealed class MainMenuView : UIView
    {
        private enum Mode
        {
            Main,
            Confirm,
            Panel
        }

        private const float ColumnX = 150f;
        private const float ColumnWidth = 580f;
        private const float SlideDistance = 28f;

        private RectTransform _column;
        private CanvasGroup _columnGroup;
        private RectTransform _confirm;
        private CanvasGroup _confirmGroup;
        private NavButton _play;
        private NavButton _continue;
        private NavButton _newGame;
        private NavButton _settings;
        private NavButton _achievements;
        private NavButton _howToPlay;
        private NavButton _credits;
        private NavButton _exit;
        private NavButton _languageLink;
        private NavButton _confirmCancel;
        private Text _version;
        private Text _detail;

        private Mode _mode;
        private Coroutine _swap;
        private bool _hasSave;
        private NavButton _lastSelected;
        private Vector2 _columnRest;
        private Vector2 _confirmRest;

        public Action<NavButton> RegisterSounds { get; set; }

        /// <summary>Drives the ambience / random one-shots while the menu is on screen.</summary>
        public MenuAudioManager MenuAudio { get; set; }

        /// <summary>The desktop build can quit; browsers and phones cannot, so EXIT is not offered there.</summary>
        public static bool ExitAvailable => Application.platform != RuntimePlatform.WebGLPlayer && !Application.isMobilePlatform;

        public bool IsConfirmOpen => _mode == Mode.Confirm;
        public bool IsPanelOpen => _mode == Mode.Panel;
        public bool HasSave => _hasSave;

        public event Action ContinueClicked;
        public event Action NewGameClicked;
        public event Action NewGameConfirmed;
        public event Action SettingsClicked;
        public event Action AchievementsClicked;
        public event Action HowToPlayClicked;
        public event Action CreditsClicked;
        public event Action ExitClicked;
        public event Action LanguageClicked;

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            // Soft darkening on the left edge only; the right side belongs to the 3D shop.
            var shade = Factory.Image("Left Shade", Root, theme.gradientLeft, new Color(0.03f, 0.025f, 0.02f, 0.86f));
            shade.rectTransform.anchorMin = new Vector2(0f, 0f);
            shade.rectTransform.anchorMax = new Vector2(0f, 1f);
            shade.rectTransform.pivot = new Vector2(0f, 0.5f);
            shade.rectTransform.sizeDelta = new Vector2(1060f, 0f);

            _columnRest = new Vector2(ColumnX, -52f);
            _column = UIFactory.Rect("Column", Root);
            UIFactory.Anchor(_column, new Vector2(0f, 1f), new Vector2(0f, 1f), _columnRest, new Vector2(ColumnWidth, 930f));
            _columnGroup = Factory.Group(_column);

            BuildLogo(_column);
            BuildNavigation(_column);
            BuildFooter();
            BuildConfirm();
            ApplyMode(instant: true);
            SetHasSave(false);
        }

        // ---------------------------------------------------------------- building

        private void BuildLogo(RectTransform parent)
        {
            var theme = Factory.Theme;

            var pole = BarberPoleStripe.Create(Factory, parent, "Pole", vertical: false, length: 190f, thickness: 9f, bandWidth: 9f, speed: 10f);
            UIFactory.Anchor((RectTransform)pole.transform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(3f, -2f), new Vector2(190f, 9f));

            var title = Factory.Label("Title", parent, theme.displayFont, 88, theme.textPrimary, TextAnchor.UpperLeft);
            title.text = "BARBER SHOP";
            title.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(-2f, -22f), new Vector2(760f, 110f));
            UIFactory.Spacing(title, 2f);
            UIFactory.SoftShadow(title, new Color(0f, 0f, 0f, 0.5f), new Vector2(0f, -3f));

            var subtitle = Factory.Label("Subtitle", parent, theme.semiBoldFont, 28, theme.accent, TextAnchor.UpperLeft);
            subtitle.text = "SIMULATOR";
            UIFactory.Anchor(subtitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(4f, -132f), new Vector2(520f, 40f));
            UIFactory.Spacing(subtitle, 15f);

            var tagline = Factory.Label("Tagline", parent, theme.bodyFont, 20, theme.textMuted, TextAnchor.UpperLeft, "menu.overline");
            tagline.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(tagline.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(4f, -176f), new Vector2(560f, 30f));
        }

        private void BuildNavigation(RectTransform parent)
        {
            var list = UIFactory.Rect("Buttons", parent);
            UIFactory.Anchor(list, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(-8f, -228f), new Vector2(ColumnWidth, 700f));
            var layout = list.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 4f;
            layout.childControlHeight = false;
            layout.childControlWidth = false;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = false;
            layout.childAlignment = TextAnchor.UpperLeft;

            _play = Nav(list, "menu.play", NavStyle.Primary, () => NewGameClicked?.Invoke());
            _continue = Nav(list, "menu.continue", NavStyle.Primary, () => ContinueClicked?.Invoke());
            _detail = _continue.Detail;
            _newGame = Nav(list, "menu.new_game", NavStyle.Standard, () => NewGameClicked?.Invoke());
            _settings = Nav(list, "menu.settings", NavStyle.Standard, () => SettingsClicked?.Invoke());
            _achievements = Nav(list, "menu.achievements", NavStyle.Standard, () => AchievementsClicked?.Invoke());
            _howToPlay = Nav(list, "menu.how_to_play", NavStyle.Standard, () => HowToPlayClicked?.Invoke());
            _credits = Nav(list, "menu.credits", NavStyle.Standard, () => CreditsClicked?.Invoke());
            _exit = Nav(list, "menu.exit", NavStyle.Standard, () => ExitClicked?.Invoke());
            _exit.gameObject.SetActive(ExitAvailable);
        }

        private NavButton Nav(Transform parent, string key, NavStyle style, Action onClick)
        {
            var nav = NavButtonFactory.Create(Factory, parent, "Button " + key, key, style, ColumnWidth - 20f, onClick);
            RegisterSounds?.Invoke(nav);
            return nav;
        }

        private void BuildFooter()
        {
            var theme = Factory.Theme;
            var footer = UIFactory.Rect("Footer", Root);
            UIFactory.Anchor(footer, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(ColumnX, 22f), new Vector2(ColumnWidth, 56f));

            _version = Factory.Label("Version", footer, theme.bodyFont, 18, new Color(theme.textMuted.r, theme.textMuted.g, theme.textMuted.b, 0.75f), TextAnchor.MiddleLeft);
            _version.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(_version.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(4f, 0f), new Vector2(150f, 40f));

            _languageLink = NavButtonFactory.Create(Factory, footer, "Language", null, NavStyle.Link, 340f, () => LanguageClicked?.Invoke());
            UIFactory.Anchor((RectTransform)_languageLink.transform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(150f, 0f), new Vector2(340f, 56f));
            _languageLink.SetLabelColors(theme.textMuted, theme.textPrimary);
            _languageLink.Label.text = string.Empty;
            RegisterSounds?.Invoke(_languageLink);
        }

        private void BuildConfirm()
        {
            var theme = Factory.Theme;
            _confirmRest = new Vector2(ColumnX - 24f, 0f);
            _confirm = UIFactory.Rect("Confirm", Root);
            UIFactory.Anchor(_confirm, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), _confirmRest, new Vector2(ColumnWidth + 48f, 430f));
            _confirmGroup = Factory.Group(_confirm, 0f);

            var bg = Factory.Image("Background", _confirm, null, theme.panelSolid, raycast: true);
            UIFactory.Stretch(bg.rectTransform);
            for (int side = 0; side < 4; side++)
            {
                var line = Factory.Image("Border " + side, _confirm, null, theme.panelLine);
                var rt = line.rectTransform;
                bool horizontal = side < 2;
                rt.anchorMin = new Vector2(0f, side == 0 ? 1f : 0f);
                rt.anchorMax = new Vector2(horizontal ? 1f : (side == 2 ? 0f : 1f), horizontal ? (side == 0 ? 1f : 0f) : 1f);
                rt.pivot = new Vector2(horizontal ? 0.5f : (side == 2 ? 0f : 1f), horizontal ? (side == 0 ? 1f : 0f) : 0.5f);
                rt.sizeDelta = horizontal ? new Vector2(0f, 1f) : new Vector2(1f, 0f);
                rt.anchoredPosition = Vector2.zero;
            }

            var stripe = BarberPoleStripe.Create(Factory, _confirm, "Pole", vertical: false, length: 64f, thickness: 6f, bandWidth: 7f, speed: 0f);
            UIFactory.Anchor((RectTransform)stripe.transform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(48f, -36f), new Vector2(64f, 6f));

            var overline = Factory.Label("Overline", _confirm, theme.semiBoldFont, 17, theme.accent, TextAnchor.UpperLeft, "menu.new_game", upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(48f, -54f), new Vector2(500f, 26f));
            UIFactory.Spacing(overline, 5f);

            var title = Factory.Label("Title", _confirm, theme.displayFont, 50, theme.textPrimary, TextAnchor.UpperLeft, "menu.confirm_title");
            title.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(46f, -80f), new Vector2(560f, 66f));

            var body = Factory.Label("Body", _confirm, theme.bodyFont, 24, theme.textMuted, TextAnchor.UpperLeft, "menu.confirm_new");
            body.lineSpacing = 1.2f;
            UIFactory.Anchor(body.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(48f, -160f), new Vector2(ColumnWidth - 40f, 100f));

            _confirmCancel = NavButtonFactory.Create(Factory, _confirm, "Cancel", "common.cancel", NavStyle.Standard, 240f, () => ShowConfirm(false));
            UIFactory.Anchor((RectTransform)_confirmCancel.transform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(24f, 28f), new Vector2(240f, 88f));
            RegisterSounds?.Invoke(_confirmCancel);

            var start = NavButtonFactory.Create(Factory, _confirm, "Start", "menu.confirm_yes", NavStyle.Standard, 320f, () =>
            {
                ShowConfirm(false);
                NewGameConfirmed?.Invoke();
            });
            UIFactory.Anchor((RectTransform)start.transform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-24f, 28f), new Vector2(320f, 88f));
            start.SetLabelColors(theme.accent, Color.white);
            RegisterSounds?.Invoke(start);
        }

        // ---------------------------------------------------------------- state

        /// <summary>PLAY when there is nothing to continue, CONTINUE + NEW GAME when a save exists.</summary>
        public void SetHasSave(bool hasSave)
        {
            _hasSave = hasSave;
            _play.gameObject.SetActive(!hasSave);
            _continue.gameObject.SetActive(hasSave);
            _newGame.gameObject.SetActive(hasSave);
            if (!hasSave) _detail.text = string.Empty;
            if (_mode == Mode.Main && IsVisible) FocusPrimary();
        }

        /// <summary>The small line under CONTINUE, e.g. "Day 3 · $420".</summary>
        public void SetContinueDetail(string detail) => _detail.text = _hasSave ? detail : string.Empty;

        public void SetContinueState(bool available, string detail)
        {
            SetHasSave(available);
            SetContinueDetail(detail);
        }

        public void SetLanguageLabel(string text) => _languageLink.Label.text = text;
        public void SetVersion(string text) => _version.text = text;

        /// <summary>Asks before replacing a save: the confirmation fades in over the column.</summary>
        public void ShowConfirm(bool show) => SwitchTo(show ? Mode.Confirm : Mode.Main);

        /// <summary>A settings / achievements / how-to-play / credits panel is opening (true) or closed again (false).</summary>
        public void SetPanelOpen(bool open) => SwitchTo(open ? Mode.Panel : Mode.Main);

        private void SwitchTo(Mode target)
        {
            if (_mode == target) return;
            if (_mode == Mode.Main) RememberSelection();
            var previous = _mode;
            _mode = target;
            if (_swap != null) StopCoroutine(_swap);
            _swap = null;
            if (!gameObject.activeInHierarchy)
            {
                ApplyMode(instant: true);
                return;
            }
            _swap = StartCoroutine(SwapRoutine(previous));
        }

        private IEnumerator SwapRoutine(Mode previous)
        {
            // Out first (short), then in, so the two never fight for the same screen space.
            var outGroup = previous == Mode.Main ? _columnGroup : previous == Mode.Confirm ? _confirmGroup : null;
            var outRect = previous == Mode.Main ? _column : previous == Mode.Confirm ? _confirm : null;
            var outRest = previous == Mode.Main ? _columnRest : _confirmRest;
            bool moves = !LiveSettings.ReduceMotion;

            _columnGroup.interactable = _columnGroup.blocksRaycasts = false;
            _confirmGroup.interactable = _confirmGroup.blocksRaycasts = false;

            if (outGroup != null)
                yield return UIAnimation.FadeAndSlide(outGroup, outRect, 0f, outRest, outRest + new Vector2(moves ? -SlideDistance * 0.6f : 0f, 0f), 0.16f);

            var inGroup = _mode == Mode.Main ? _columnGroup : _mode == Mode.Confirm ? _confirmGroup : null;
            if (inGroup == null) yield break;
            var inRect = _mode == Mode.Main ? _column : _confirm;
            var inRest = _mode == Mode.Main ? _columnRest : _confirmRest;
            var from = inRest + new Vector2(moves ? -SlideDistance : 0f, 0f);
            inRect.anchoredPosition = from;
            yield return UIAnimation.FadeAndSlide(inGroup, inRect, 1f, from, inRest, 0.26f);
            inGroup.interactable = inGroup.blocksRaycasts = true;
            Focus();
        }

        private void ApplyMode(bool instant)
        {
            bool main = _mode == Mode.Main;
            bool confirm = _mode == Mode.Confirm;
            _columnGroup.alpha = main ? 1f : 0f;
            _columnGroup.interactable = _columnGroup.blocksRaycasts = main;
            _column.anchoredPosition = _columnRest;
            _confirmGroup.alpha = confirm ? 1f : 0f;
            _confirmGroup.interactable = _confirmGroup.blocksRaycasts = confirm;
            _confirm.anchoredPosition = _confirmRest;
            if (instant) Focus();
        }

        private void RememberSelection()
        {
            var system = EventSystem.current;
            if (system == null || system.currentSelectedGameObject == null) return;
            var nav = system.currentSelectedGameObject.GetComponent<NavButton>();
            if (nav != null && nav.transform.IsChildOf(_column)) _lastSelected = nav;
        }

        private void Focus()
        {
            if (_mode == Mode.Confirm) _confirmCancel.SelectSilently();
            else if (_mode == Mode.Main) FocusPrimary();
        }

        private void FocusPrimary()
        {
            var target = _lastSelected != null && _lastSelected.gameObject.activeInHierarchy ? _lastSelected : (_hasSave ? _continue : _play);
            target.SelectSilently();
        }

        // ---------------------------------------------------------------- show / hide

        protected override void OnShown()
        {
            _mode = Mode.Main;
            _lastSelected = null;
            ApplyMode(instant: false);
            _columnGroup.alpha = 0f;
            if (MenuAudio != null) MenuAudio.Begin();
            FocusPrimary();
        }

        protected override void OnHiding()
        {
            if (_swap != null) StopCoroutine(_swap);
            _swap = null;
            if (MenuAudio != null) MenuAudio.End(1.4f);
        }

        protected override IEnumerator ShowRoutine()
        {
            Group.alpha = 1f;
            var from = _columnRest + new Vector2(LiveSettings.ReduceMotion ? 0f : -24f, 0f);
            _columnGroup.alpha = 0f;
            yield return UIAnimation.FadeAndSlide(_columnGroup, _column, 1f, from, _columnRest, 0.7f);
        }

        protected override void OnShownInstant()
        {
            _columnGroup.alpha = 1f;
            _column.anchoredPosition = _columnRest;
        }

        protected override IEnumerator HideRoutine()
        {
            yield return UIAnimation.Fade(Group, 0f, 0.45f);
            gameObject.SetActive(false);
        }
    }
}
