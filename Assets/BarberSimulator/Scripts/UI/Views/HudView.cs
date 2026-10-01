using System.Collections;
using System.Collections.Generic;
using BarberSimulator.Input;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>How the shop status on the HUD is coloured.</summary>
    public enum ShopStatusStyle
    {
        Closed,
        Open,
        Closing
    }

    /// <summary>
    /// Minimal gameplay HUD: objective (top-left), workday clock and shop level (top-centre), money (top-right),
    /// crosshair + interaction prompt (centre), toasts and hints. On touch devices the prompt moves onto the USE button.
    /// </summary>
    public sealed class HudView : UIView, IToastPresenter
    {
        private RectTransform _objectiveRoot;
        private CanvasGroup _objectiveGroup;
        private Text _objectiveTitle;
        private Text _objectiveProgress;
        private Image _objectiveBarFill;
        private RectTransform _objectiveBarTrack;

        private RectTransform _moneyRoot;
        private Text _moneyText;
        private Text _moneyDelta;
        private CanvasGroup _moneyDeltaGroup;
        // The cash display counts up (or down) to the real balance instead of jumping.
        private float _moneyShown;
        private int _moneyTarget;
        private bool _moneyInitialised;

        private Text _dayText;
        private Text _clockText;
        private Text _statusText;
        private Text _levelText;
        private Image _levelBarFill;

        private Image _crosshair;
        private CanvasGroup _promptGroup;
        private Text _promptKey;
        private Text _promptText;
        private RectTransform _promptKeyCap;

        private CanvasGroup _captureHint;
        private CanvasGroup _hintGroup;
        private Text _hintText;

        private CanvasGroup _bannerGroup;
        private Text _bannerOverline;
        private Text _bannerTitle;
        private Image _bannerRule;

        private CanvasGroup _toastGroup;
        private Text _toastText;
        private readonly Queue<string> _toasts = new Queue<string>();
        private Coroutine _toastRoutine;
        private Coroutine _hintRoutine;
        private Coroutine _moneyRoutine;
        private readonly Queue<(string overline, string title, bool complete, bool celebrate)> _banners = new Queue<(string, string, bool, bool)>();
        private Coroutine _bannerRoutine;

        private StreakBadge _streak;
        private GoalsPanel _goals;
        private FloatingPopups _popups;
        private UIParticleBurst _burst;
        private System.Action _clickSound;

        private bool _touchMode;
        private bool _promptVisible;
        private float _promptAlpha;
        private bool _focus;
        private float _focusAmount;
        private bool _captureVisible;

        public TouchControlsView TouchControls { get; private set; }

        public void BuildTouchControls(InputService input, System.Action clickSound)
        {
            _clickSound = clickSound;
            var rect = UIFactory.Rect("Touch Controls", Root);
            rect.SetAsFirstSibling();
            TouchControls = rect.gameObject.AddComponent<TouchControlsView>();
            TouchControls.Build(Factory, input, clickSound);
        }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            // Objective tracker
            _objectiveRoot = UIFactory.Rect("Objective", Root);
            UIFactory.Anchor(_objectiveRoot, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(40f, -36f), new Vector2(560f, 130f));
            _objectiveGroup = Factory.Group(_objectiveRoot);
            var objectiveShade = Factory.Image("Shade", _objectiveRoot, theme.gradientLeft, new Color(0f, 0f, 0f, 0.45f));
            UIFactory.Stretch(objectiveShade.rectTransform, -40f, -120f, -20f, -10f);

            var overline = Factory.Label("Overline", _objectiveRoot, theme.semiBoldFont, 16, theme.accent, TextAnchor.UpperLeft, "hud.objective", upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), Vector2.zero, new Vector2(400f, 24f));
            UIFactory.Spacing(overline, 4f);

            _objectiveTitle = Factory.Label("Title", _objectiveRoot, theme.mediumFont, 28, theme.textPrimary, TextAnchor.UpperLeft);
            UIFactory.Anchor(_objectiveTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -28f), new Vector2(520f, 40f));
            UIFactory.SoftShadow(_objectiveTitle, theme.shadow, new Vector2(0f, -2f));

            _objectiveBarTrack = Factory.Image("Bar", _objectiveRoot, null, new Color(1f, 1f, 1f, 0.15f)).rectTransform;
            UIFactory.Anchor(_objectiveBarTrack, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -78f), new Vector2(220f, 3f));
            _objectiveBarFill = Factory.Image("Fill", _objectiveBarTrack, null, theme.accent);
            _objectiveBarFill.rectTransform.anchorMin = Vector2.zero;
            _objectiveBarFill.rectTransform.anchorMax = new Vector2(0f, 1f);
            _objectiveBarFill.rectTransform.pivot = new Vector2(0f, 0.5f);
            _objectiveBarFill.rectTransform.sizeDelta = Vector2.zero;

            _objectiveProgress = Factory.Label("Progress", _objectiveRoot, theme.semiBoldFont, 20, theme.textMuted, TextAnchor.MiddleLeft);
            UIFactory.Anchor(_objectiveProgress.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(236f, -79f), new Vector2(120f, 30f));

            _hintText = Factory.Label("Hint", _objectiveRoot, theme.bodyFont, 20, theme.textMuted, TextAnchor.UpperLeft);
            UIFactory.Anchor(_hintText.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -100f), new Vector2(520f, 60f));
            UIFactory.SoftShadow(_hintText, theme.shadow, new Vector2(0f, -1f));
            _hintGroup = _hintText.gameObject.AddComponent<CanvasGroup>();
            _hintGroup.alpha = 0f;

            // Money
            _moneyRoot = UIFactory.Rect("Money", Root);
            UIFactory.Anchor(_moneyRoot, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-40f, -36f), new Vector2(300f, 90f));
            var moneyShade = Factory.Image("Shade", _moneyRoot, theme.circleSoft, new Color(0f, 0f, 0f, 0.4f));
            UIFactory.Stretch(moneyShade.rectTransform, -60f, -30f, -30f, -30f);
            var moneyOverline = Factory.Label("Overline", _moneyRoot, theme.semiBoldFont, 16, theme.accent, TextAnchor.UpperRight, "hud.cash", upper: true);
            UIFactory.Anchor(moneyOverline.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), Vector2.zero, new Vector2(300f, 24f));
            UIFactory.Spacing(moneyOverline, 4f);
            _moneyText = Factory.Label("Amount", _moneyRoot, theme.displayFont, 46, theme.textPrimary, TextAnchor.UpperRight);
            UIFactory.Anchor(_moneyText.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(0f, -20f), new Vector2(300f, 60f));
            UIFactory.SoftShadow(_moneyText, theme.shadow, new Vector2(0f, -2f));
            _moneyDelta = Factory.Label("Delta", _moneyRoot, theme.semiBoldFont, 24, theme.accent, TextAnchor.UpperRight);
            UIFactory.Anchor(_moneyDelta.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(0f, -84f), new Vector2(300f, 30f));
            _moneyDeltaGroup = _moneyDelta.gameObject.AddComponent<CanvasGroup>();
            _moneyDeltaGroup.alpha = 0f;

            // Workday: day number, clock, open/closed state and shop level (top centre)
            var workday = UIFactory.Rect("Workday", Root);
            UIFactory.Anchor(workday, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -30f), new Vector2(360f, 120f));
            var workdayShade = Factory.Image("Shade", workday, theme.circleSoft, new Color(0f, 0f, 0f, 0.4f));
            UIFactory.Stretch(workdayShade.rectTransform, -70f, -70f, -30f, -30f);
            _dayText = Factory.Label("Day", workday, theme.semiBoldFont, 16, theme.accent, TextAnchor.UpperCenter);
            UIFactory.Anchor(_dayText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(360f, 24f));
            UIFactory.Spacing(_dayText, 4f);
            _clockText = Factory.Label("Clock", workday, theme.displayFont, 46, theme.textPrimary, TextAnchor.UpperCenter);
            UIFactory.Anchor(_clockText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -20f), new Vector2(360f, 60f));
            UIFactory.SoftShadow(_clockText, theme.shadow, new Vector2(0f, -2f));
            _statusText = Factory.Label("Status", workday, theme.semiBoldFont, 17, theme.textMuted, TextAnchor.UpperCenter);
            UIFactory.Anchor(_statusText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -76f), new Vector2(360f, 26f));
            UIFactory.Spacing(_statusText, 4f);
            _levelText = Factory.Label("Level", workday, theme.semiBoldFont, 14, theme.textMuted, TextAnchor.UpperCenter);
            UIFactory.Anchor(_levelText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -98f), new Vector2(360f, 20f));
            UIFactory.Spacing(_levelText, 3f);
            var levelTrack = Factory.Image("LevelBar", workday, null, new Color(1f, 1f, 1f, 0.15f));
            UIFactory.Anchor(levelTrack.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -118f), new Vector2(160f, 3f));
            _levelBarFill = Factory.Image("Fill", levelTrack.rectTransform, null, theme.accent);
            _levelBarFill.rectTransform.anchorMin = Vector2.zero;
            _levelBarFill.rectTransform.anchorMax = new Vector2(0f, 1f);
            _levelBarFill.rectTransform.pivot = new Vector2(0f, 0.5f);
            _levelBarFill.rectTransform.sizeDelta = Vector2.zero;

            // Crosshair and desktop prompt
            _crosshair = Factory.Image("Crosshair", Root, theme.crosshairDot, new Color(1f, 1f, 1f, 0.55f));
            UIFactory.Anchor(_crosshair.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(8f, 8f));

            var prompt = UIFactory.Rect("Prompt", Root);
            UIFactory.Anchor(prompt, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 1f), new Vector2(0f, -46f), new Vector2(700f, 50f));
            _promptGroup = Factory.Group(prompt, 0f);
            _promptGroup.blocksRaycasts = false;
            _promptKeyCap = UIFactory.Rect("KeyCap", prompt);
            UIFactory.Anchor(_promptKeyCap, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(40f, 40f));
            var cap = Factory.Image("Cap", _promptKeyCap, theme.roundedRect, new Color(0.95f, 0.92f, 0.86f, 0.95f));
            UIFactory.Stretch(cap.rectTransform);
            _promptKey = Factory.Label("Key", _promptKeyCap, theme.semiBoldFont, 22, new Color(0.08f, 0.07f, 0.06f), TextAnchor.MiddleCenter);
            _promptKey.text = "E";
            UIFactory.Stretch(_promptKey.rectTransform, 0f, 0f, 0f, 2f);
            _promptText = Factory.Label("Text", prompt, theme.mediumFont, 24, theme.textPrimary, TextAnchor.MiddleLeft);
            _promptText.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(_promptText.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0f), new Vector2(600f, 40f));
            UIFactory.SoftShadow(_promptText, new Color(0f, 0f, 0f, 0.7f), new Vector2(0f, -2f));

            var capture = Factory.Label("Capture Hint", Root, theme.mediumFont, 22, theme.textPrimary, TextAnchor.MiddleCenter, "hud.click_to_look");
            UIFactory.Anchor(capture.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 60f), new Vector2(600f, 40f));
            UIFactory.SoftShadow(capture, new Color(0f, 0f, 0f, 0.8f), new Vector2(0f, -2f));
            _captureHint = capture.gameObject.AddComponent<CanvasGroup>();
            _captureHint.alpha = 0f;
            _captureHint.blocksRaycasts = false;

            // Objective banner (centre-top)
            var banner = UIFactory.Rect("Banner", Root);
            UIFactory.Anchor(banner, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -150f), new Vector2(900f, 140f));
            _bannerGroup = Factory.Group(banner, 0f);
            _bannerGroup.blocksRaycasts = false;
            var bannerShade = Factory.Image("Shade", banner, theme.circleSoft, new Color(0f, 0f, 0f, 0.5f));
            UIFactory.Stretch(bannerShade.rectTransform, -120f, -120f, -40f, -40f);
            _bannerOverline = Factory.Label("Overline", banner, theme.semiBoldFont, 18, theme.accent, TextAnchor.UpperCenter);
            UIFactory.Anchor(_bannerOverline.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(900f, 28f));
            UIFactory.Spacing(_bannerOverline, 6f);
            _bannerRule = Factory.Image("Rule", banner, null, theme.accent);
            UIFactory.Anchor(_bannerRule.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, -38f), new Vector2(40f, 2f));
            _bannerTitle = Factory.Label("Title", banner, theme.displayFont, 54, theme.textPrimary, TextAnchor.UpperCenter);
            UIFactory.Anchor(_bannerTitle.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -48f), new Vector2(900f, 80f));
            UIFactory.SoftShadow(_bannerTitle, theme.shadow, new Vector2(0f, -3f));

            // Toast (lower centre)
            var toast = UIFactory.Rect("Toast", Root);
            UIFactory.Anchor(toast, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 150f), new Vector2(900f, 56f));
            _toastGroup = Factory.Group(toast, 0f);
            _toastGroup.blocksRaycasts = false;
            var toastShade = Factory.Image("Shade", toast, theme.circleSoft, new Color(0f, 0f, 0f, 0.55f));
            UIFactory.Stretch(toastShade.rectTransform, 40f, 40f, -16f, -16f);
            _toastText = Factory.Label("Text", toast, theme.bodyFont, 24, theme.textPrimary, TextAnchor.MiddleCenter);
            UIFactory.Stretch(_toastText.rectTransform);
            UIFactory.SoftShadow(_toastText, new Color(0f, 0f, 0f, 0.7f), new Vector2(0f, -2f));

            // Streak badge (right of the clock) and the daily goals list (under the objective).
            var streakHost = UIFactory.Rect("Streak Host", Root);
            UIFactory.Stretch(streakHost);
            _streak = streakHost.gameObject.AddComponent<StreakBadge>();
            _streak.Build(Factory, streakHost);
            var goalsHost = UIFactory.Rect("Goals Host", Root);
            UIFactory.Stretch(goalsHost);
            _goals = goalsHost.gameObject.AddComponent<GoalsPanel>();
            _goals.Build(Factory, goalsHost, () => _clickSound?.Invoke());

            // Juice layers sit on top of everything else.
            var popupHost = UIFactory.Rect("Popups", Root);
            UIFactory.Stretch(popupHost);
            _popups = popupHost.gameObject.AddComponent<FloatingPopups>();
            _popups.Build(Factory, popupHost, 8);
            var burstHost = UIFactory.Rect("Burst", Root);
            UIFactory.Stretch(burstHost);
            _burst = burstHost.gameObject.AddComponent<UIParticleBurst>();
            _burst.Build(Factory, burstHost, 40);
        }

        public void SetTouchMode(bool touch)
        {
            _touchMode = touch;
            if (TouchControls != null) TouchControls.gameObject.SetActive(touch);
            // Leave room for the pause button in the corner.
            _moneyRoot.anchoredPosition = touch ? new Vector2(-130f, -36f) : new Vector2(-40f, -36f);
            // Phones keep the goals list folded until the player taps it open.
            if (_goals != null) _goals.SetCollapsed(touch);
        }

        /// <summary>The daily goals list. Passing no rows hides the panel.</summary>
        public void SetGoals(IReadOnlyList<GoalRow> rows) => _goals.SetRows(rows);

        /// <summary>Streak badge; <paramref name="bonusText"/> is e.g. "×1.25 tips". Pulses when <paramref name="animate"/> is set.</summary>
        public void SetStreak(int streak, string bonusText, bool animate) => _streak.SetStreak(streak, bonusText, animate);

        public void ShowStreakLost(int lostStreak) => _streak.ShowLost(lostStreak);

        /// <summary>A short "+$25" / "+15 XP" pop above the crosshair. Lane 0 is left, lane 1 right of the centre.</summary>
        public void ShowPopup(string text, bool xp, int lane)
        {
            if (!gameObject.activeInHierarchy) return;
            var theme = Factory.Theme;
            var origin = new Vector2(lane == 0 ? -110f : 110f, lane == 0 ? 170f : 150f) + new Vector2(Random.Range(-14f, 14f), 0f);
            _popups.Spawn(text, xp ? theme.flame : theme.accent, origin, xp ? 32 : 42);
        }

        /// <summary>Confetti from the banner position.</summary>
        public void PlayBurst()
        {
            if (gameObject.activeInHierarchy) _burst.Play(new Vector2(0f, 300f));
        }

        /// <summary>Top-centre clock: "DAY 2", "09:41", "OPEN".</summary>
        public void SetWorkday(string dayText, string clockText, string statusText, ShopStatusStyle style)
        {
            _dayText.text = dayText.ToUpperInvariant();
            _clockText.text = clockText;
            _statusText.text = statusText.ToUpperInvariant();
            switch (style)
            {
                case ShopStatusStyle.Open: _statusText.color = new Color(0.62f, 0.82f, 0.55f); break;
                case ShopStatusStyle.Closing: _statusText.color = new Color(0.9f, 0.62f, 0.34f); break;
                default: _statusText.color = Factory.Theme.textMuted; break;
            }
        }

        /// <summary>Shop level label and experience progress (0..1) under the clock.</summary>
        public void SetLevel(string levelText, float progress01)
        {
            _levelText.text = levelText.ToUpperInvariant();
            _levelBarFill.rectTransform.anchorMax = new Vector2(Mathf.Clamp01(progress01), 1f);
        }

        public void SetObjective(string title, int progress, int target)
        {
            _objectiveGroup.alpha = string.IsNullOrEmpty(title) ? 0f : 1f;
            _objectiveTitle.text = title;
            bool counted = target > 1;
            _objectiveBarTrack.gameObject.SetActive(counted);
            _objectiveProgress.gameObject.SetActive(counted);
            if (counted)
            {
                _objectiveProgress.text = progress + " / " + target;
                StartCoroutine(AnimateBar(Mathf.Clamp01((float)progress / target)));
            }
        }

        private IEnumerator AnimateBar(float target)
        {
            var rt = _objectiveBarFill.rectTransform;
            float from = rt.anchorMax.x;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.unscaledDeltaTime / 0.4f;
                rt.anchorMax = new Vector2(Mathf.Lerp(from, target, Core.Easing.OutCubic(t)), 1f);
                yield return null;
            }
        }

        /// <summary>Queues a centre banner ("NEW OBJECTIVE" / "OBJECTIVE COMPLETE").</summary>
        public void ShowBanner(string overline, string title, bool complete, bool celebrate = false)
        {
            _banners.Enqueue((overline, title, complete, celebrate));
            if (_bannerRoutine == null && gameObject.activeInHierarchy) _bannerRoutine = StartCoroutine(BannerLoop());
        }

        private IEnumerator BannerLoop()
        {
            while (_banners.Count > 0)
            {
                var (overline, title, complete, celebrate) = _banners.Dequeue();
                _bannerOverline.text = overline.ToUpperInvariant();
                _bannerTitle.text = title;
                _bannerTitle.fontSize = complete ? 48 : 54;
                _bannerTitle.color = complete ? Factory.Theme.accent : Factory.Theme.textPrimary;

                var rect = (RectTransform)_bannerGroup.transform;
                var rest = new Vector2(0f, -150f);
                if (celebrate) PlayBurst();
                yield return UIAnimation.FadeAndSlide(_bannerGroup, rect, 1f, rest + new Vector2(0f, 16f), rest, 0.45f);
                yield return UIAnimation.Wait(complete ? 1.8f : 2.4f);
                yield return UIAnimation.FadeAndSlide(_bannerGroup, rect, 0f, rest, rest + new Vector2(0f, 10f), 0.4f);
            }
            _bannerRoutine = null;
        }

        public void SetMoney(int amount, int delta)
        {
            _moneyTarget = amount;
            if (!_moneyInitialised || delta == 0)
            {
                // First value and plain refreshes show the balance at once; only real changes count up.
                _moneyInitialised = true;
                _moneyShown = amount;
                _moneyText.text = Economy.EconomyService.Format(amount);
            }
            if (delta == 0) return;
            _moneyDelta.text = (delta > 0 ? "+" : "−") + Economy.EconomyService.Format(Mathf.Abs(delta));
            if (_moneyRoutine != null) StopCoroutine(_moneyRoutine);
            if (gameObject.activeInHierarchy) _moneyRoutine = StartCoroutine(MoneyPop());
        }

        private IEnumerator MoneyPop()
        {
            StartCoroutine(UIAnimation.Scale(_moneyText.transform, Vector3.one * 1.12f, Vector3.one, 0.35f, overshoot: true));
            _moneyDeltaGroup.alpha = 1f;
            yield return UIAnimation.Wait(1.6f);
            yield return UIAnimation.Fade(_moneyDeltaGroup, 0f, 0.5f);
            _moneyRoutine = null;
        }

        /// <summary>Desktop prompt "[E] Pick up  Trash"; on touch only the USE button changes.</summary>
        public void SetInteraction(bool visible, string verb, string label, bool canInteract)
        {
            _promptVisible = visible && !_touchMode;
            _focus = visible;
            if (visible)
            {
                _promptText.text = string.IsNullOrEmpty(label)
                    ? verb
                    : verb + "  <color=#" + ColorUtility.ToHtmlStringRGB(Factory.Theme.textMuted) + ">" + label + "</color>";
                _promptKeyCap.gameObject.SetActive(canInteract);
                // Centre the key cap + text pair as one unit.
                float textWidth = _promptText.preferredWidth;
                float capWidth = canInteract ? 40f + 14f : 0f;
                float total = capWidth + textWidth;
                _promptKeyCap.anchoredPosition = new Vector2(-total * 0.5f + 20f, 0f);
                _promptText.rectTransform.anchoredPosition = new Vector2(-total * 0.5f + capWidth, 0f);
            }
            if (TouchControls != null) TouchControls.SetUse(visible && canInteract && _touchMode, verb);
        }

        public void SetCaptureHint(bool visible) => _captureVisible = visible;

        public void ShowHint(string text)
        {
            if (_hintRoutine != null) StopCoroutine(_hintRoutine);
            _hintText.text = text;
            if (gameObject.activeInHierarchy) _hintRoutine = StartCoroutine(HintRoutine());
        }

        private IEnumerator HintRoutine()
        {
            yield return UIAnimation.Fade(_hintGroup, 1f, 0.4f);
            yield return UIAnimation.Wait(7f);
            yield return UIAnimation.Fade(_hintGroup, 0f, 0.8f);
            _hintRoutine = null;
        }

        public void ShowToast(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            if (_toasts.Count > 2) return;
            _toasts.Enqueue(text);
            if (_toastRoutine == null && gameObject.activeInHierarchy) _toastRoutine = StartCoroutine(ToastLoop());
        }

        private IEnumerator ToastLoop()
        {
            while (_toasts.Count > 0)
            {
                _toastText.text = _toasts.Dequeue();
                yield return UIAnimation.Fade(_toastGroup, 1f, 0.2f);
                yield return UIAnimation.Wait(Mathf.Clamp(1.2f + _toastText.text.Length * 0.045f, 2f, 4.5f));
                yield return UIAnimation.Fade(_toastGroup, 0f, 0.35f);
            }
            _toastRoutine = null;
        }

        private void Update()
        {
            float dt = Time.unscaledDeltaTime;
            _promptAlpha = Mathf.MoveTowards(_promptAlpha, _promptVisible ? 1f : 0f, dt / 0.15f);
            _promptGroup.alpha = _promptAlpha;

            _focusAmount = Mathf.MoveTowards(_focusAmount, _focus ? 1f : 0f, dt / 0.12f);
            var c = _crosshair.color;
            c.a = _touchMode ? 0.35f + 0.4f * _focusAmount : 0.5f + 0.45f * _focusAmount;
            _crosshair.color = c;
            _crosshair.rectTransform.sizeDelta = Vector2.one * Mathf.Lerp(7f, 11f, _focusAmount);

            _captureHint.alpha = Mathf.MoveTowards(_captureHint.alpha, _captureVisible ? 0.9f : 0f, dt / 0.25f);

            // Cash counter: closes most of the gap each second, never slower than $30/s, so big payments roll up quickly.
            if (_moneyInitialised && !Mathf.Approximately(_moneyShown, _moneyTarget))
            {
                float gap = Mathf.Abs(_moneyTarget - _moneyShown);
                _moneyShown = Mathf.MoveTowards(_moneyShown, _moneyTarget, Mathf.Max(30f, gap * 3.5f) * dt);
                _moneyText.text = Economy.EconomyService.Format(Mathf.RoundToInt(_moneyShown));
            }
        }

        protected override void OnShown()
        {
            if (_toasts.Count > 0 && _toastRoutine == null) _toastRoutine = StartCoroutine(ToastLoop());
            if (_banners.Count > 0 && _bannerRoutine == null) _bannerRoutine = StartCoroutine(BannerLoop());
        }

        private void OnDisable()
        {
            _toastRoutine = null;
            _bannerRoutine = null;
            _hintRoutine = null;
            _moneyRoutine = null;
            if (_toastGroup != null) _toastGroup.alpha = 0f;
            if (_bannerGroup != null) _bannerGroup.alpha = 0f;
            if (_popups != null) _popups.Clear();
            if (_burst != null) _burst.Clear();
            // A hidden HUD cannot count; it shows the real balance when it comes back.
            if (_moneyInitialised && _moneyText != null)
            {
                _moneyShown = _moneyTarget;
                _moneyText.text = Economy.EconomyService.Format(_moneyTarget);
            }
        }
    }
}
