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
    /// Five-tab settings screen (Gameplay, Graphics, Audio, Controls, Accessibility). Every control writes straight
    /// through <see cref="SettingsService"/>, which applies and persists the value; nothing here is cosmetic.
    /// </summary>
    public sealed class SettingsView : MenuPanelView
    {
        private static readonly string[] TabKeys =
        {
            "settings.tab.gameplay", "settings.tab.graphics", "settings.tab.audio", "settings.tab.controls", "settings.tab.accessibility"
        };
        private static readonly string[] QualityKeys = { "settings.quality.low", "settings.quality.medium", "settings.quality.high", "settings.quality.ultra" };
        private static readonly string[] ShadowKeys = { "settings.shadow.off", "settings.shadow.low", "settings.shadow.high" };
        private static readonly string[] TextureKeys = { "settings.texture.full", "settings.texture.half" };
        private static readonly string[] FpsKeys = { "settings.fps.30", "settings.fps.60", "settings.fps.unlimited" };
        private static readonly string[] SubtitleKeys = { "settings.subtitle.normal", "settings.subtitle.large" };

        private const float TabBarHeight = 60f;

        private readonly List<GameObject> _pages = new List<GameObject>();
        private readonly List<ScrollRect> _scrolls = new List<ScrollRect>();
        private readonly List<NavButton> _tabs = new List<NavButton>();
        private readonly List<Image> _tabUnderlines = new List<Image>();
        private readonly List<GameObject> _desktopControls = new List<GameObject>();
        private readonly List<GameObject> _touchControls = new List<GameObject>();

        private SettingsService _settings;
        private Action _hover;
        private Action _click;
        private RectTransform _pageArea;
        private int _activeTab;
        private bool _touch;

        private OptionSelector _quality, _shadowQuality, _textureQuality, _fpsLimit, _language, _subtitleSize;
        private SliderRow _renderScale;
        private SwitchToggle _antiAliasing, _ambientEffects, _postProcessing, _motionBlur, _vSync;
        private SliderRow _master, _music, _sfx, _dialogue, _ambience, _ui;
        private SliderRow _mouse, _touchSensitivity, _joystickOpacity;
        private SwitchToggle _invertY, _dynamicJoystick, _cameraBob, _reduceMotion, _hints;
        private Text _subtitlePreview;

        public event Action<string> LanguageSelected;

        protected override float PanelWidth => 1120f;
        protected override float PanelHeight => 940f;
        protected override string TitleKey => "settings.title";
        protected override string OverlineKey => "settings.overline";
        protected override Selectable DefaultSelectable => _tabs.Count > _activeTab ? _tabs[_activeTab].Button : base.DefaultSelectable;

        /// <summary>V-Sync and the frame cap mean nothing in a browser (requestAnimationFrame paces it) or on a phone.</summary>
        private static bool FrameOptionsAvailable => Application.platform != RuntimePlatform.WebGLPlayer && !Application.isMobilePlatform;

        public void Bind(SettingsService settings, Action hover, Action click)
        {
            _settings = settings;
            _hover = hover;
            _click = click;
        }

        /// <summary>Shows the controls reference for touch (gestures) or keyboard and mouse (keys).</summary>
        public void SetTouchMode(bool touch)
        {
            _touch = touch;
            foreach (var go in _desktopControls) if (go != null) go.SetActive(!touch);
            foreach (var go in _touchControls) if (go != null) go.SetActive(touch);
        }

        protected override void OnBuildPanel(RectTransform content)
        {
            BuildTabs(content);

            _pageArea = UIFactory.Rect("Pages", content);
            UIFactory.Stretch(_pageArea, 0f, 0f, TabBarHeight + 8f, 0f);
            BuildPages();
            SetTouchMode(_touch);

            Factory.Text.OnLanguageChanged(() =>
            {
                LayoutTabs();
                RefreshValues();
            });
            LayoutTabs();
        }

        // ---------------------------------------------------------------- tabs

        private void BuildTabs(RectTransform content)
        {
            var theme = Factory.Theme;
            var bar = UIFactory.Rect("Tabs", content);
            bar.anchorMin = new Vector2(0f, 1f);
            bar.anchorMax = new Vector2(1f, 1f);
            bar.pivot = new Vector2(0.5f, 1f);
            bar.offsetMin = new Vector2(0f, -TabBarHeight);
            bar.offsetMax = Vector2.zero;

            var baseline = Factory.Image("Baseline", bar, null, theme.panelLine);
            baseline.rectTransform.anchorMin = new Vector2(0f, 0f);
            baseline.rectTransform.anchorMax = new Vector2(1f, 0f);
            baseline.rectTransform.sizeDelta = new Vector2(0f, 1f);

            for (int i = 0; i < TabKeys.Length; i++)
            {
                int index = i;
                var tab = NavButtonFactory.Create(Factory, bar, "Tab " + i, TabKeys[i], NavStyle.Link, 170f, () => SelectTab(index));
                var rect = (RectTransform)tab.transform;
                rect.anchorMin = rect.anchorMax = new Vector2(0f, 0.5f);
                rect.pivot = new Vector2(0f, 0.5f);
                tab.Label.fontSize = 18;
                tab.Label.alignment = TextAnchor.MiddleCenter;
                UIFactory.Stretch(tab.Label.rectTransform);
                RegisterSounds?.Invoke(tab);
                _tabs.Add(tab);

                var underline = Factory.Image("Underline", tab.transform, null, theme.barberRed);
                underline.rectTransform.anchorMin = new Vector2(0f, 0f);
                underline.rectTransform.anchorMax = new Vector2(1f, 0f);
                underline.rectTransform.pivot = new Vector2(0.5f, 0f);
                underline.rectTransform.offsetMin = new Vector2(10f, 0f);
                underline.rectTransform.offsetMax = new Vector2(-10f, 3f);
                _tabUnderlines.Add(underline);
            }
        }

        /// <summary>Tab widths follow the localized label length; the longest German words must not collide.</summary>
        private void LayoutTabs()
        {
            float x = 0f;
            for (int i = 0; i < _tabs.Count; i++)
            {
                var label = _tabs[i].Label;
                float width = Mathf.Max(label.preferredWidth, label.text.Length * 14f) + 44f;
                var rect = (RectTransform)_tabs[i].transform;
                rect.anchoredPosition = new Vector2(x, 0f);
                rect.sizeDelta = new Vector2(width, TabBarHeight - 2f);
                var layout = rect.GetComponent<LayoutElement>();
                if (layout != null) layout.preferredWidth = width;
                x += width + 4f;
            }
        }

        public void SelectTab(int index)
        {
            _activeTab = Mathf.Clamp(index, 0, _pages.Count - 1);
            for (int i = 0; i < _pages.Count; i++)
            {
                bool active = i == _activeTab;
                _pages[i].SetActive(active);
                _tabUnderlines[i].enabled = active;
                _tabs[i].SetLabelColors(active ? Factory.Theme.textPrimary : Factory.Theme.textMuted, Color.white);
            }
            if (_scrolls.Count > _activeTab) _scrolls[_activeTab].verticalNormalizedPosition = 1f;
        }

        // ---------------------------------------------------------------- pages

        private RectTransform Page()
        {
            var content = CreateScroll("Page " + _pages.Count, _pageArea, out var scroll);
            _pages.Add(content.parent.gameObject);
            _scrolls.Add(scroll);
            return content;
        }

        private void BuildPages()
        {
            string Percent(float v) => Mathf.RoundToInt(v * 100f) + "%";
            string Multiplier(float v) => v.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + "x";
            string Key(string[] keys, int i) => Factory.Text.Get(keys[Mathf.Clamp(i, 0, keys.Length - 1)]);

            // GAMEPLAY
            var gameplay = Page();
            var languages = LocalizationService.Languages;
            _language = SettingsWidgetFactory.Selector(Factory, gameplay, "settings.language", languages.Length, i => languages[i].DisplayName, _hover, _click);
            _language.Changed += i => LanguageSelected?.Invoke(languages[i].Code);
            _hints = SettingsWidgetFactory.Toggle(Factory, gameplay, "settings.hints", _hover, _click);
            _hints.Changed += v => _settings.SetTutorialHints(v);

            // GRAPHICS
            var graphics = Page();
            _quality = SettingsWidgetFactory.Selector(Factory, graphics, "settings.quality", QualityKeys.Length, i => Key(QualityKeys, i), _hover, _click);
            _quality.Changed += i => _settings.SetQuality((QualityTier)i);
            _renderScale = SettingsWidgetFactory.Slider(Factory, graphics, "settings.render_scale", 0.5f, 1f, Percent, _hover);
            _renderScale.Changed += v => _settings.SetRenderScale(v);
            _shadowQuality = SettingsWidgetFactory.Selector(Factory, graphics, "settings.shadows", ShadowKeys.Length, i => Key(ShadowKeys, i), _hover, _click);
            _shadowQuality.Changed += i => _settings.SetShadowQuality((ShadowDetail)i);
            _textureQuality = SettingsWidgetFactory.Selector(Factory, graphics, "settings.textures", TextureKeys.Length, i => Key(TextureKeys, i), _hover, _click);
            _textureQuality.Changed += i => _settings.SetTextureQuality(i);
            _antiAliasing = SettingsWidgetFactory.Toggle(Factory, graphics, "settings.anti_aliasing", _hover, _click);
            _antiAliasing.Changed += v => _settings.SetAntiAliasing(v);
            _ambientEffects = SettingsWidgetFactory.Toggle(Factory, graphics, "settings.ambient_effects", _hover, _click);
            _ambientEffects.Changed += v => _settings.SetAmbientEffects(v);
            _postProcessing = SettingsWidgetFactory.Toggle(Factory, graphics, "settings.post_processing", _hover, _click);
            _postProcessing.Changed += v =>
            {
                _settings.SetPostProcessing(v);
                SettingsWidgetFactory.SetRowEnabled(_motionBlur, v);
            };
            _motionBlur = SettingsWidgetFactory.Toggle(Factory, graphics, "settings.motion_blur", _hover, _click);
            _motionBlur.Changed += v => _settings.SetMotionBlur(v);
            if (FrameOptionsAvailable)
            {
                _vSync = SettingsWidgetFactory.Toggle(Factory, graphics, "settings.vsync", _hover, _click);
                _vSync.Changed += v =>
                {
                    _settings.SetVSync(v);
                    SettingsWidgetFactory.SetRowEnabled(_fpsLimit, !v);
                };
                _fpsLimit = SettingsWidgetFactory.Selector(Factory, graphics, "settings.fps_limit", FpsKeys.Length, i => Key(FpsKeys, i), _hover, _click);
                _fpsLimit.Changed += i => _settings.SetFpsLimit((FpsLimit)i);
            }

            // AUDIO
            var audio = Page();
            _master = SettingsWidgetFactory.Slider(Factory, audio, "settings.master", 0f, 1f, Percent, _hover);
            _master.Changed += v => _settings.SetMasterVolume(v);
            _music = SettingsWidgetFactory.Slider(Factory, audio, "settings.music", 0f, 1f, Percent, _hover);
            _music.Changed += v => _settings.SetMusicVolume(v);
            _sfx = SettingsWidgetFactory.Slider(Factory, audio, "settings.sfx", 0f, 1f, Percent, _hover);
            _sfx.Changed += v => _settings.SetSfxVolume(v);
            _dialogue = SettingsWidgetFactory.Slider(Factory, audio, "settings.dialogue", 0f, 1f, Percent, _hover);
            _dialogue.Changed += v => _settings.SetDialogueVolume(v);
            _ambience = SettingsWidgetFactory.Slider(Factory, audio, "settings.ambience", 0f, 1f, Percent, _hover);
            _ambience.Changed += v => _settings.SetAmbienceVolume(v);
            _ui = SettingsWidgetFactory.Slider(Factory, audio, "settings.ui", 0f, 1f, Percent, _hover);
            _ui.Changed += v => _settings.SetUiVolume(v);

            // CONTROLS
            var controls = Page();
            _mouse = SettingsWidgetFactory.Slider(Factory, controls, "settings.mouse_sensitivity", 0.1f, 3f, Multiplier, _hover);
            _mouse.Changed += v => _settings.SetMouseSensitivity(v);
            _touchSensitivity = SettingsWidgetFactory.Slider(Factory, controls, "settings.touch_sensitivity", 0.1f, 3f, Multiplier, _hover);
            _touchSensitivity.Changed += v => _settings.SetTouchSensitivity(v);
            _invertY = SettingsWidgetFactory.Toggle(Factory, controls, "settings.invert_y", _hover, _click);
            _invertY.Changed += v => _settings.SetInvertLookY(v);
            _joystickOpacity = SettingsWidgetFactory.Slider(Factory, controls, "settings.joystick_opacity", 0.2f, 1f, Percent, _hover);
            _joystickOpacity.Changed += v => _settings.SetJoystickOpacity(v);
            _dynamicJoystick = SettingsWidgetFactory.Toggle(Factory, controls, "settings.dynamic_joystick", _hover, _click);
            _dynamicJoystick.Changed += v => _settings.SetDynamicJoystick(v);
            SettingsWidgetFactory.Header(Factory, controls, "settings.controls_reference");
            foreach (var entry in ControlsReference.All)
            {
                _desktopControls.Add(SettingsWidgetFactory.ControlLine(Factory, controls, entry, touch: false).gameObject);
                if (entry.TouchKey != "controls.touch.none")
                    _touchControls.Add(SettingsWidgetFactory.ControlLine(Factory, controls, entry, touch: true).gameObject);
            }
            var note = Factory.Label("Note", controls, Factory.Theme.bodyFont, 18, Factory.Theme.textMuted, TextAnchor.UpperLeft, "settings.controls_note");
            var noteLayout = note.gameObject.AddComponent<LayoutElement>();
            noteLayout.preferredHeight = 64f;
            noteLayout.minHeight = 64f;

            // ACCESSIBILITY
            var access = Page();
            _subtitleSize = SettingsWidgetFactory.Selector(Factory, access, "settings.subtitle_size", SubtitleKeys.Length, i => Key(SubtitleKeys, i), _hover, _click);
            _subtitleSize.Changed += i =>
            {
                _settings.SetSubtitleSize(i);
                RenderSubtitlePreview();
            };
            var previewRow = UIFactory.Rect("Subtitle Preview", access);
            var previewLayout = previewRow.gameObject.AddComponent<LayoutElement>();
            previewLayout.preferredHeight = 110f;
            previewLayout.minHeight = 110f;
            var previewBg = Factory.Image("Background", previewRow, null, Factory.Theme.panelRaised);
            UIFactory.Stretch(previewBg.rectTransform, 0f, 0f, 10f, 10f);
            _subtitlePreview = Factory.Label("Text", previewRow, Factory.Theme.bodyFont, 28, Factory.Theme.textPrimary, TextAnchor.MiddleCenter, "settings.subtitle_preview");
            UIFactory.Stretch(_subtitlePreview.rectTransform, 24f, 24f, 10f, 10f);
            _cameraBob = SettingsWidgetFactory.Toggle(Factory, access, "settings.camera_bob", _hover, _click);
            _cameraBob.Changed += v => _settings.SetCameraBob(v);
            _reduceMotion = SettingsWidgetFactory.Toggle(Factory, access, "settings.reduce_motion", _hover, _click);
            _reduceMotion.Changed += v => _settings.SetReduceMotion(v);
        }

        private void RenderSubtitlePreview()
        {
            if (_subtitlePreview == null || _settings == null) return;
            float scale = _settings.Data.subtitleSize == 1 ? LiveSettings.LargeSubtitleScale : 1f;
            _subtitlePreview.fontSize = Mathf.RoundToInt(28f * scale);
        }

        protected override void OnShown()
        {
            RefreshValues();
            SelectTab(_activeTab);
            base.OnShown();
        }

        /// <summary>Pulls current values from the settings model without triggering change events.</summary>
        public void RefreshValues()
        {
            if (_settings == null || _language == null) return;
            var d = _settings.Data;
            _language.Refresh();
            var languages = LocalizationService.Languages;
            for (int i = 0; i < languages.Length; i++)
                if (languages[i].Code == Factory.Text.Service.CurrentLanguage) _language.SetIndex(i);
            _hints.SetValue(d.tutorialHints); _hints.Snap();

            _quality.SetIndex((int)d.quality);
            _renderScale.SetValue(d.renderScale);
            _shadowQuality.SetIndex(d.shadowQuality);
            _textureQuality.SetIndex(d.textureQuality);
            _antiAliasing.SetValue(d.antiAliasing); _antiAliasing.Snap();
            _ambientEffects.SetValue(d.ambientEffects); _ambientEffects.Snap();
            _postProcessing.SetValue(d.postProcessing); _postProcessing.Snap();
            _motionBlur.SetValue(d.motionBlur); _motionBlur.Snap();
            SettingsWidgetFactory.SetRowEnabled(_motionBlur, d.postProcessing);
            if (_vSync != null)
            {
                _vSync.SetValue(d.vSync); _vSync.Snap();
                _fpsLimit.SetIndex(d.fpsLimit);
                SettingsWidgetFactory.SetRowEnabled(_fpsLimit, !d.vSync);
            }

            _master.SetValue(d.masterVolume);
            _music.SetValue(d.musicVolume);
            _sfx.SetValue(d.sfxVolume);
            _dialogue.SetValue(d.dialogueVolume);
            _ambience.SetValue(d.ambienceVolume);
            _ui.SetValue(d.uiVolume);

            _mouse.SetValue(d.mouseSensitivity);
            _touchSensitivity.SetValue(d.touchSensitivity);
            _invertY.SetValue(d.invertLookY); _invertY.Snap();
            _joystickOpacity.SetValue(d.joystickOpacity);
            _dynamicJoystick.SetValue(d.dynamicJoystick); _dynamicJoystick.Snap();

            _subtitleSize.SetIndex(d.subtitleSize);
            _cameraBob.SetValue(d.cameraBob); _cameraBob.Snap();
            _reduceMotion.SetValue(d.reduceMotion); _reduceMotion.Snap();
            RenderSubtitlePreview();
        }
    }
}
