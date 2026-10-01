using System;
using System.Collections.Generic;
using BarberSimulator.Economy;
using BarberSimulator.Shop;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// The shop computer: a modal list of upgrades in three tabs (Tools, Comfort &amp; Decor, Expansion). Rows show
    /// the price, the effects and why an upgrade cannot be bought yet. Buying goes straight through
    /// <see cref="UpgradeService"/>; the world is frozen while this view is open.
    /// </summary>
    public sealed class ShopStoreView : UIView
    {
        private static readonly string[] TabKeys = { "store.tab.tools", "store.tab.comfort", "store.tab.expansion" };
        private static readonly UpgradeCategory[] TabCategories = { UpgradeCategory.Tools, UpgradeCategory.Comfort, UpgradeCategory.Expansion };
        private const float RowHeight = 132f;

        private readonly List<MenuButton> _tabs = new List<MenuButton>();
        private readonly List<Image> _tabUnderlines = new List<Image>();
        private UpgradeService _upgrades;
        private ShopProgression _progression;
        private EconomyService _economy;
        private RectTransform _content;
        private Text _balance;
        private Text _levelText;
        private int _activeTab;

        public event Action CloseClicked;
        public Action<MenuButton> RegisterSounds { get; set; }

        public void Bind(UpgradeService upgrades, ShopProgression progression, EconomyService economy)
        {
            _upgrades = upgrades;
            _progression = progression;
            _economy = economy;
        }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            var dim = Factory.Image("Dim", Root, null, new Color(0f, 0f, 0f, 0.62f), raycast: true);
            UIFactory.Stretch(dim.rectTransform);
            var vignette = Factory.Image("Vignette", Root, theme.vignette, new Color(0f, 0f, 0f, 0.7f));
            UIFactory.Stretch(vignette.rectTransform);

            var panel = UIFactory.Rect("Panel", Root);
            UIFactory.Anchor(panel, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1240f, 860f));
            var bg = Factory.Image("Background", panel, theme.roundedRect, new Color(0.05f, 0.042f, 0.036f, 0.94f), raycast: true);
            UIFactory.Stretch(bg.rectTransform);
            var rule = Factory.Image("Rule", panel, null, theme.accent);
            UIFactory.Anchor(rule.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(32f, -28f), new Vector2(40f, 2f));

            var overline = Factory.Label("Overline", panel, theme.semiBoldFont, 16, theme.accent, TextAnchor.UpperLeft, "store.overline", upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(32f, -40f), new Vector2(600f, 24f));
            UIFactory.Spacing(overline, 4f);
            var title = Factory.Label("Title", panel, theme.displayFont, 64, theme.textPrimary, TextAnchor.UpperLeft, "store.title");
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -62f), new Vector2(760f, 84f));

            var cashLabel = Factory.Label("CashLabel", panel, theme.semiBoldFont, 16, theme.accent, TextAnchor.UpperRight, "hud.cash", upper: true);
            UIFactory.Anchor(cashLabel.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-32f, -40f), new Vector2(300f, 24f));
            UIFactory.Spacing(cashLabel, 4f);
            _balance = Factory.Label("Balance", panel, theme.displayFont, 52, theme.textPrimary, TextAnchor.UpperRight);
            UIFactory.Anchor(_balance.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-32f, -62f), new Vector2(300f, 70f));

            BuildTabs(panel);
            BuildList(panel);

            _levelText = Factory.Label("Level", panel, theme.mediumFont, 20, theme.textMuted, TextAnchor.MiddleRight);
            UIFactory.Anchor(_levelText.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-32f, 40f), new Vector2(620f, 36f));

            var closeRect = UIFactory.Rect("Close", panel);
            UIFactory.Anchor(closeRect, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(32f, 24f), new Vector2(300f, 64f));
            var closeButton = UIFactory.PlainButton(closeRect);
            var closeAccent = Factory.Image("Accent", closeRect, null, theme.accent);
            UIFactory.Anchor(closeAccent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var closeLabel = Factory.Label("Label", closeRect, theme.mediumFont, 34, theme.textPrimary, TextAnchor.MiddleLeft, "common.close");
            UIFactory.Anchor(closeLabel.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(280f, 50f));
            var closeMenu = closeRect.gameObject.AddComponent<MenuButton>();
            closeMenu.Configure(closeLabel, closeAccent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            closeButton.onClick.AddListener(() => CloseClicked?.Invoke());
            RegisterSounds?.Invoke(closeMenu);

            Factory.Text.OnLanguageChanged(Refresh);
        }

        private void BuildTabs(RectTransform panel)
        {
            var theme = Factory.Theme;
            var bar = UIFactory.Rect("Tabs", panel);
            UIFactory.Anchor(bar, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(32f, -142f), new Vector2(1176f, 52f));
            var baseline = Factory.Image("Baseline", bar, null, theme.panelLine);
            baseline.rectTransform.anchorMin = new Vector2(0f, 0f);
            baseline.rectTransform.anchorMax = new Vector2(1f, 0f);
            baseline.rectTransform.sizeDelta = new Vector2(0f, 1f);

            float x = 0f;
            for (int i = 0; i < TabKeys.Length; i++)
            {
                int index = i;
                var rect = UIFactory.Rect("Tab " + i, bar);
                UIFactory.Anchor(rect, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(x, 0f), new Vector2(260f, 52f));
                var button = UIFactory.PlainButton(rect);
                var label = Factory.Label("Label", rect, theme.semiBoldFont, 19, theme.textMuted, TextAnchor.MiddleLeft, TabKeys[i], upper: true);
                UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 4f), new Vector2(260f, 40f));
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
                x += 270f;
            }
        }

        private void BuildList(RectTransform panel)
        {
            var viewport = UIFactory.Rect("Viewport", panel);
            UIFactory.Anchor(viewport, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(32f, -210f), new Vector2(1176f, 520f));
            viewport.gameObject.AddComponent<RectMask2D>();
            var hit = Factory.Image("Hit", viewport, null, new Color(0f, 0f, 0f, 0f), raycast: true);
            UIFactory.Stretch(hit.rectTransform);

            _content = UIFactory.Rect("Content", viewport);
            _content.anchorMin = new Vector2(0f, 1f);
            _content.anchorMax = new Vector2(1f, 1f);
            _content.pivot = new Vector2(0.5f, 1f);
            _content.offsetMin = new Vector2(0f, 0f);
            _content.offsetMax = new Vector2(0f, 0f);
            var layout = _content.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 12f;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            var fitter = _content.gameObject.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var scroll = viewport.gameObject.AddComponent<ScrollRect>();
            scroll.viewport = viewport;
            scroll.content = _content;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 45f;
        }

        protected override void OnShown()
        {
            Refresh();
        }

        public void SelectTab(int index)
        {
            _activeTab = Mathf.Clamp(index, 0, TabKeys.Length - 1);
            _content.anchoredPosition = Vector2.zero;
            Refresh();
        }

        /// <summary>Rebuilds the header and the rows for the active tab from the current game state.</summary>
        public void Refresh()
        {
            if (_upgrades == null || !IsVisible) return;
            var theme = Factory.Theme;
            var loc = Factory.Text.Service;

            _balance.text = EconomyService.Format(_economy.Money);
            _levelText.text = _progression.IsMaxLevel
                ? loc.Format("store.level_max", _progression.Level)
                : loc.Format("store.level", _progression.Level, _progression.XpIntoLevel, _progression.XpForNextLevel);

            for (int i = 0; i < _tabs.Count; i++)
            {
                bool active = i == _activeTab;
                _tabUnderlines[i].enabled = active;
                _tabs[i].SetNormalColor(active ? theme.textPrimary : theme.textMuted);
            }

            for (int i = _content.childCount - 1; i >= 0; i--)
            {
                // Destroy is deferred to the end of the frame; deactivate first so the layout ignores the old rows.
                var old = _content.GetChild(i).gameObject;
                old.SetActive(false);
                Destroy(old);
            }
            foreach (var upgrade in _upgrades.All)
                if (upgrade != null && upgrade.category == TabCategories[_activeTab]) BuildRow(upgrade);
        }

        private void BuildRow(UpgradeDefinition upgrade)
        {
            var theme = Factory.Theme;
            var loc = Factory.Text.Service;
            var status = _upgrades.GetStatus(upgrade);
            bool locked = status == PurchaseStatus.LevelTooLow;

            var row = UIFactory.Rect("Upgrade " + upgrade.upgradeId, _content);
            var element = row.gameObject.AddComponent<LayoutElement>();
            element.minHeight = RowHeight;
            element.preferredHeight = RowHeight;

            var bg = Factory.Image("Background", row, theme.roundedRect, new Color(1f, 0.95f, 0.85f, locked ? 0.03f : 0.06f));
            UIFactory.Stretch(bg.rectTransform);
            var edge = Factory.Image("Edge", row, null, status == PurchaseStatus.Owned ? theme.accent : (locked ? theme.textDisabled : theme.accentDeep));
            UIFactory.Anchor(edge.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(3f, RowHeight - 24f));

            var name = Factory.Label("Name", row, theme.semiBoldFont, 27, locked ? theme.textMuted : theme.textPrimary, TextAnchor.UpperLeft);
            name.text = loc.Get(upgrade.nameKey);
            UIFactory.Anchor(name.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(26f, -14f), new Vector2(720f, 36f));
            var description = Factory.Label("Description", row, theme.bodyFont, 19, theme.textMuted, TextAnchor.UpperLeft);
            description.text = loc.Get(upgrade.descriptionKey);
            UIFactory.Anchor(description.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(26f, -50f), new Vector2(740f, 52f));
            var effects = Factory.Label("Effects", row, theme.semiBoldFont, 17, locked ? theme.textDisabled : theme.accent, TextAnchor.UpperLeft);
            effects.text = EffectText(upgrade);
            UIFactory.Anchor(effects.rectTransform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(26f, 8f), new Vector2(740f, 26f));

            var price = Factory.Label("Price", row, theme.displayFont, 38, locked ? theme.textMuted : theme.textPrimary, TextAnchor.MiddleRight);
            price.text = EconomyService.Format(upgrade.price);
            UIFactory.Anchor(price.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-250f, -14f), new Vector2(220f, 52f));

            var buttonRect = UIFactory.Rect("Buy", row);
            UIFactory.Anchor(buttonRect, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-24f, 6f), new Vector2(200f, 56f));
            bool buyable = status == PurchaseStatus.Available;
            Color fill, text;
            string labelKey;
            switch (status)
            {
                case PurchaseStatus.Owned: fill = new Color(theme.accent.r, theme.accent.g, theme.accent.b, 0.16f); text = theme.accent; labelKey = "store.owned"; break;
                case PurchaseStatus.Available: fill = theme.accent; text = new Color(0.08f, 0.07f, 0.06f); labelKey = "store.buy"; break;
                default: fill = new Color(1f, 1f, 1f, 0.06f); text = theme.textDisabled; labelKey = "store.buy"; break;
            }
            var buttonBg = Factory.Image("Background", buttonRect, theme.roundedRect, fill, raycast: true);
            UIFactory.Stretch(buttonBg.rectTransform);
            var buttonLabel = Factory.Label("Label", buttonRect, theme.semiBoldFont, 24, text, TextAnchor.MiddleCenter, labelKey, upper: true);
            UIFactory.Stretch(buttonLabel.rectTransform);
            UIFactory.Spacing(buttonLabel, 3f);
            var button = buttonRect.gameObject.AddComponent<Button>();
            button.targetGraphic = buttonBg;
            button.interactable = buyable;
            if (buyable)
            {
                button.transition = Selectable.Transition.ColorTint;
                var colors = button.colors;
                colors.normalColor = Color.white;
                colors.highlightedColor = new Color(1.12f, 1.08f, 1f, 1f);
                colors.pressedColor = new Color(0.85f, 0.82f, 0.78f, 1f);
                colors.disabledColor = Color.white;
                colors.fadeDuration = theme.hoverDuration;
                button.colors = colors;
                button.onClick.AddListener(() => Purchase(upgrade));
            }
            else
            {
                button.transition = Selectable.Transition.None;
            }

            string reason = status == PurchaseStatus.LevelTooLow ? loc.Format("store.requires_level", upgrade.requiredShopLevel)
                : status == PurchaseStatus.NotEnoughMoney ? loc.Get("store.not_enough_money") : string.Empty;
            if (reason.Length > 0)
            {
                var reasonText = Factory.Label("Reason", row, theme.mediumFont, 16, status == PurchaseStatus.LevelTooLow ? theme.textMuted : new Color(0.86f, 0.5f, 0.42f), TextAnchor.UpperRight);
                reasonText.text = reason;
                UIFactory.Anchor(reasonText.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-24f, 14f), new Vector2(300f, 24f));
            }
        }

        private void Purchase(UpgradeDefinition upgrade)
        {
            if (_upgrades.TryPurchase(upgrade)) Refresh();
        }

        /// <summary>The effect line under an upgrade: numbers from the data, plus the optional note.</summary>
        private string EffectText(UpgradeDefinition upgrade)
        {
            var loc = Factory.Text.Service;
            var parts = new List<string>();
            if (!Mathf.Approximately(upgrade.patienceMultiplier, 1f)) parts.Add(loc.Format("upgrade.effect.patience", Percent(upgrade.patienceMultiplier - 1f)));
            if (!Mathf.Approximately(upgrade.tipMultiplier, 1f)) parts.Add(loc.Format("upgrade.effect.tips", Percent(upgrade.tipMultiplier - 1f)));
            if (!Mathf.Approximately(upgrade.spawnIntervalMultiplier, 1f) && upgrade.spawnIntervalMultiplier > 0.01f)
                parts.Add(loc.Format("upgrade.effect.customers", Percent(1f / upgrade.spawnIntervalMultiplier - 1f)));
            if (upgrade.maxQueueBonus != 0) parts.Add(loc.Format("upgrade.effect.queue", upgrade.maxQueueBonus));
            if (!Mathf.Approximately(upgrade.reputationGainMultiplier, 1f)) parts.Add(loc.Format("upgrade.effect.reputation", Percent(upgrade.reputationGainMultiplier - 1f)));
            if (!string.IsNullOrEmpty(upgrade.unlockAreaId)) parts.Add(loc.Get("upgrade.effect.area"));
            if (!string.IsNullOrEmpty(upgrade.effectNoteKey)) parts.Add(loc.Get(upgrade.effectNoteKey));
            return string.Join("  ·  ", parts);
        }

        private static int Percent(float delta) => Mathf.RoundToInt(delta * 100f);
    }
}
