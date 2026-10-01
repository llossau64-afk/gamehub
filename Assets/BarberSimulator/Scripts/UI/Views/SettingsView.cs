using System;
using System.Collections.Generic;
using BarberSimulator.Localization;
using BarberSimulator.Save;
using BarberSimulator.Settings;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Four-tab settings screen. Every control writes straight through <see cref="SettingsService"/>,
    /// which applies and persists the value; nothing here is cosmetic.
    /// </summary>
    public sealed class SettingsView : UIView
    {
        private static readonly string[] TabKeys = { "settings.tab.graphics", "settings.tab.audio", "settings.tab.controls", "settings.tab.gameplay" };
        private static readonly string[] QualityKeys = { "settings.quality.low", "settings.quality.medium", "settings.quality.high" };

        private readonly List<RectTransform> _pages = new List<RectTransform>();
        private readonly List<MenuButton> _tabs = new List<MenuButton>();
        private readonly List<Image> _tabUnderlines = new List<Image>();

        private SettingsService _settings;
        private Action _hover;
        private Action _click;
        private Image _backdrop;
        private RectTransform _panel;
        private int _activeTab;

        private OptionSelector _quality;
        private SliderRow _renderScale;
        private SwitchToggle _shadows;
        private SwitchToggle _antiAliasing;
        private SliderRow _master, _music, _sfx, _ambience, _ui;
        private SliderRow _mouse, _touch, _joystickOpacity;
        private SwitchToggle _invertY, _dynamicJoystick, _cameraBob, _hints;
        private OptionSelector _language;

        public event Action BackClicked;
        public event Action<string> LanguageSelected;
        public Action<MenuButton> RegisterSounds { get; set; }

        public void Bind(SettingsService settings, Action hover, Action click)
        {
            _settings = settings;
            _hover = hover;
            _click = click;
        }

        /// <summary>In the pause menu the 3D scene is darkened behind the panel.</summary>
        public void SetBackdrop(bool dark)
        {
            _backdrop.color = new Color(0f, 0f, 0f, dark ? 0.55f : 0f);
        }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            _backdrop = Factory.Image("Backdrop", Root, null, new Color(0f, 0f, 0f, 0f), raycast: true);
            UIFactory.Stretch(_backdrop.rectTransform);

            var gradient = Factory.Image("Gradient", Root, theme.gradientLeft, new Color(0.03f, 0.025f, 0.02f, 0.92f));
            gradient.rectTransform.anchorMin = new Vector2(0f, 0f);
            gradient.rectTransform.anchorMax = new Vector2(0f, 1f);
            gradient.rectTransform.pivot = new Vector2(0f, 0.5f);
            gradient.rectTransform.sizeDelta = new Vector2(1400f, 0f);

            _panel = UIFactory.Rect("Panel", Root);
            UIFactory.Anchor(_panel, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(150f, 0f), new Vector2(780f, 820f));

            var title = Factory.Label("Title", _panel, theme.displayFont, 72, theme.textPrimary, TextAnchor.UpperLeft, "settings.title");
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), Vector2.zero, new Vector2(780f, 96f));

            BuildTabs();
            BuildPages();

            var backRect = UIFactory.Rect("Back", _panel);
            UIFactory.Anchor(backRect, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(300f, 64f));
            var backButton = UIFactory.PlainButton(backRect);
            var backAccent = Factory.Image("Accent", backRect, null, theme.accent);
            UIFactory.Anchor(backAccent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var backLabel = Factory.Label("Label", backRect, theme.mediumFont, 34, theme.textPrimary, TextAnchor.MiddleLeft, "common.back");
            UIFactory.Anchor(backLabel.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(280f, 50f));
            var backMenu = backRect.gameObject.AddComponent<MenuButton>();
            backMenu.Configure(backLabel, backAccent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            backButton.onClick.AddListener(() => BackClicked?.Invoke());
            RegisterSounds?.Invoke(backMenu);

            Factory.Text.OnLanguageChanged(RefreshValues);
        }

        private void BuildTabs()
        {
            var theme = Factory.Theme;
            var bar = UIFactory.Rect("Tabs", _panel);
            UIFactory.Anchor(bar, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -120f), new Vector2(780f, 52f));

            var baseline = Factory.Image("Baseline", bar, null, theme.panelLine);
            baseline.rectTransform.anchorMin = new Vector2(0f, 0f);
            baseline.rectTransform.anchorMax = new Vector2(1f, 0f);
            baseline.rectTransform.sizeDelta = new Vector2(0f, 1f);

            float x = 0f;
            for (int i = 0; i < TabKeys.Length; i++)
            {
                int index = i;
                var rect = UIFactory.Rect("Tab " + i, bar);
                UIFactory.Anchor(rect, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(x, 0f), new Vector2(180f, 52f));
                var button = UIFactory.PlainButton(rect);
                var label = Factory.Label("Label", rect, theme.semiBoldFont, 19, theme.textMuted, TextAnchor.MiddleLeft, TabKeys[i], upper: true);
                UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 4f), new Vector2(180f, 40f));
                UIFactory.Spacing(label, 3f);
                var underline = Factory.Image("Underline", rect, null, theme.accent);
                underline.rectTransform.anchorMin = new Vector2(0f, 0f);
                underline.rectTransform.anchorMax = new Vector2(0f, 0f);
                underline.rectTransform.pivot = new Vector2(0f, 0f);
                underline.rectTransform.sizeDelta = new Vector2(48f, 2f);
                var menuButton = rect.gameObject.AddComponent<MenuButton>();
                menuButton.Configure(label, null, theme.textMuted, theme.textPrimary, theme.textDisabled, theme.hoverDuration);
                button.onClick.AddListener(() => SelectTab(index));
                RegisterSounds?.Invoke(menuButton);
                _tabs.Add(menuButton);
                _tabUnderlines.Add(underline);
                x += 190f;
            }
        }

        private RectTransform Page()
        {
            var page = UIFactory.Rect("Page", _panel);
            UIFactory.Anchor(page, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -196f), new Vector2(780f, 520f));
            var layout = page.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 0f;
            layout.childControlHeight = true;
            layout.childControlWidth = true;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = true;
            layout.childAlignment = TextAnchor.UpperLeft;
            _pages.Add(page);
            return page;
        }

        private void BuildPages()
        {
            string Percent(float v) => Mathf.RoundToInt(v * 100f) + "%";
            string Multiplier(float v) => v.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + "x";

            var graphics = Page();
            _quality = SettingsWidgetFactory.Selector(Factory, graphics, "settings.quality", 3, i => Factory.Text.Get(QualityKeys[i]), _hover, _click);
            _quality.Changed += i => _settings.SetQuality((QualityTier)i);
            _renderScale = SettingsWidgetFactory.Slider(Factory, graphics, "settings.render_scale", 0.5f, 1f, Percent, _hover);
            _renderScale.Changed += v => _settings.SetRenderScale(v);
            _shadows = SettingsWidgetFactory.Toggle(Factory, graphics, "settings.shadows", _hover, _click);
            _shadows.Changed += v => _settings.SetShadows(v);
            _antiAliasing = SettingsWidgetFactory.Toggle(Factory, graphics, "settings.anti_aliasing", _hover, _click);
            _antiAliasing.Changed += v => _settings.SetAntiAliasing(v);

            var audio = Page();
            _master = SettingsWidgetFactory.Slider(Factory, audio, "settings.master", 0f, 1f, Percent, _hover);
            _master.Changed += v => _settings.SetMasterVolume(v);
            _music = SettingsWidgetFactory.Slider(Factory, audio, "settings.music", 0f, 1f, Percent, _hover);
            _music.Changed += v => _settings.SetMusicVolume(v);
            _sfx = SettingsWidgetFactory.Slider(Factory, audio, "settings.sfx", 0f, 1f, Percent, _hover);
            _sfx.Changed += v => _settings.SetSfxVolume(v);
            _ambience = SettingsWidgetFactory.Slider(Factory, audio, "settings.ambience", 0f, 1f, Percent, _hover);
            _ambience.Changed += v => _settings.SetAmbienceVolume(v);
            _ui = SettingsWidgetFactory.Slider(Factory, audio, "settings.ui", 0f, 1f, Percent, _hover);
            _ui.Changed += v => _settings.SetUiVolume(v);

            var controls = Page();
            _mouse = SettingsWidgetFactory.Slider(Factory, controls, "settings.mouse_sensitivity", 0.1f, 3f, Multiplier, _hover);
            _mouse.Changed += v => _settings.SetMouseSensitivity(v);
            _touch = SettingsWidgetFactory.Slider(Factory, controls, "settings.touch_sensitivity", 0.1f, 3f, Multiplier, _hover);
            _touch.Changed += v => _settings.SetTouchSensitivity(v);
            _invertY = SettingsWidgetFactory.Toggle(Factory, controls, "settings.invert_y", _hover, _click);
            _invertY.Changed += v => _settings.SetInvertLookY(v);
            _joystickOpacity = SettingsWidgetFactory.Slider(Factory, controls, "settings.joystick_opacity", 0.2f, 1f, Percent, _hover);
            _joystickOpacity.Changed += v => _settings.SetJoystickOpacity(v);
            _dynamicJoystick = SettingsWidgetFactory.Toggle(Factory, controls, "settings.dynamic_joystick", _hover, _click);
            _dynamicJoystick.Changed += v => _settings.SetDynamicJoystick(v);

            var gameplay = Page();
            var languages = LocalizationService.Languages;
            _language = SettingsWidgetFactory.Selector(Factory, gameplay, "settings.language", languages.Length, i => languages[i].DisplayName, _hover, _click);
            _language.Changed += i => LanguageSelected?.Invoke(languages[i].Code);
            _cameraBob = SettingsWidgetFactory.Toggle(Factory, gameplay, "settings.camera_bob", _hover, _click);
            _cameraBob.Changed += v => _settings.SetCameraBob(v);
            _hints = SettingsWidgetFactory.Toggle(Factory, gameplay, "settings.hints", _hover, _click);
            _hints.Changed += v => _settings.SetTutorialHints(v);
        }

        public void SelectTab(int index)
        {
            _activeTab = index;
            for (int i = 0; i < _pages.Count; i++)
            {
                bool active = i == index;
                _pages[i].gameObject.SetActive(active);
                _tabUnderlines[i].enabled = active;
                _tabs[i].SetNormalColor(active ? Factory.Theme.textPrimary : Factory.Theme.textMuted);
            }
        }

        protected override void OnShown()
        {
            RefreshValues();
            SelectTab(_activeTab);
        }

        /// <summary>Pulls current values from the settings model without triggering change events.</summary>
        public void RefreshValues()
        {
            if (_settings == null) return;
            var d = _settings.Data;
            _quality.SetIndex((int)d.quality);
            _renderScale.SetValue(d.renderScale);
            _shadows.SetValue(d.shadows); _shadows.Snap();
            _antiAliasing.SetValue(d.antiAliasing); _antiAliasing.Snap();
            _master.SetValue(d.masterVolume);
            _music.SetValue(d.musicVolume);
            _sfx.SetValue(d.sfxVolume);
            _ambience.SetValue(d.ambienceVolume);
            _ui.SetValue(d.uiVolume);
            _mouse.SetValue(d.mouseSensitivity);
            _touch.SetValue(d.touchSensitivity);
            _invertY.SetValue(d.invertLookY); _invertY.Snap();
            _joystickOpacity.SetValue(d.joystickOpacity);
            _dynamicJoystick.SetValue(d.dynamicJoystick); _dynamicJoystick.Snap();
            _cameraBob.SetValue(d.cameraBob); _cameraBob.Snap();
            _hints.SetValue(d.tutorialHints); _hints.Snap();

            var languages = LocalizationService.Languages;
            for (int i = 0; i < languages.Length; i++)
                if (languages[i].Code == Factory.Text.Service.CurrentLanguage) _language.SetIndex(i);
        }
    }
}
