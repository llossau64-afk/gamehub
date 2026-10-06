using System;
using GuessTheAnswer.Audio;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>Hooks the UI uses for sound and haptics, wired up by the app at startup.</summary>
    public static class UIFeedback
    {
        public static Action<Sfx> Sound;
        public static Action<int> Haptic;

        public static void Play(Sfx sfx) => Sound?.Invoke(sfx);
        public static void Vibrate(int ms) => Haptic?.Invoke(ms);
    }

    public enum ButtonStyle
    {
        Primary,
        Secondary,
        Ghost,
        Danger,
        Success,
        Red,
        Blue,
    }

    /// <summary>
    /// The game's button: rounded card, hover lift, press squash, click sound and haptic tick. Responds on pointer
    /// up for mouse and touch alike, ignores repeated taps for a short moment, and never fires while disabled.
    /// </summary>
    public sealed class GameButton : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler, IPointerClickHandler
    {
        public Image Background;
        public Text Label;
        public Image IconImage;
        public CanvasGroup Group;
        public Action OnClick;

        public float HoverScale = 1.03f;
        public float PressScale = 0.95f;
        public float Cooldown = 0.18f;
        public Sfx ClickSound = Sfx.Click;
        public bool HoverSound = true;

        Color baseColor;
        Color hoverColor;
        Color textColor;
        bool interactable = true;
        bool hovered;
        bool pressed;
        float lastClick = -10f;
        bool selected;
        Color selectedColor;

        public bool Interactable
        {
            get => interactable;
            set
            {
                if (interactable == value) return;
                interactable = value;
                if (Group != null)
                {
                    Group.alpha = value ? 1f : 0.42f;
                    Group.blocksRaycasts = value;
                }
                if (!value)
                {
                    hovered = false;
                    pressed = false;
                    Tween.Scale(transform, 1f, Theme.Fast);
                }
                Refresh();
            }
        }

        public void SetColors(Color background, Color text)
        {
            baseColor = background;
            float lift = background.a < 0.05f ? 0f : 0.08f;
            hoverColor = background.a < 0.05f
                ? new Color(1f, 1f, 1f, 0.06f)
                : Color.Lerp(background, Color.white, lift);
            textColor = text;
            if (Label != null) Label.color = text;
            if (IconImage != null) IconImage.color = text;
            Refresh();
        }

        public void SetStyle(ButtonStyle style)
        {
            var (bg, fg) = Colors(style);
            SetColors(bg, fg);
        }

        public static (Color bg, Color fg) Colors(ButtonStyle style)
        {
            switch (style)
            {
                case ButtonStyle.Primary: return (Theme.Accent, Theme.TextOnAccent);
                case ButtonStyle.Ghost: return (new Color(1f, 1f, 1f, 0f), Theme.Text);
                case ButtonStyle.Danger: return (Theme.Danger, Color.white);
                case ButtonStyle.Success: return (Theme.Success, Theme.TextOnAccent);
                case ButtonStyle.Red: return (Theme.Red, Color.white);
                case ButtonStyle.Blue: return (Theme.Blue, Color.white);
                default: return (Theme.SurfaceRaised, Theme.Text);
            }
        }

        /// <summary>Selected state for chips and toggles (accent background).</summary>
        public void SetSelected(bool value, Color? color = null)
        {
            selected = value;
            selectedColor = color ?? Theme.Accent;
            if (Label != null) Label.color = value ? Theme.TextOnAccent : textColor;
            if (IconImage != null) IconImage.color = value ? Theme.TextOnAccent : textColor;
            Refresh();
        }

        public void SetLabel(string text)
        {
            if (Label != null) Label.text = text;
        }

        void Refresh()
        {
            if (Background == null) return;
            Color target = selected ? selectedColor : (hovered && interactable ? hoverColor : baseColor);
            Tween.ColorTo(Background, target, Theme.Fast);
        }

        public void OnPointerEnter(PointerEventData e)
        {
            if (!interactable) return;
            hovered = true;
            Refresh();
            if (!pressed) Tween.Scale(transform, HoverScale, Theme.Fast);
            // Touch screens report an enter on every tap; only mice get the hover tick.
            if (HoverSound && e.pointerId < 0) UIFeedback.Play(Sfx.Hover);
        }

        public void OnPointerExit(PointerEventData e)
        {
            hovered = false;
            pressed = false;
            Refresh();
            Tween.Scale(transform, 1f, Theme.Normal);
        }

        public void OnPointerDown(PointerEventData e)
        {
            if (!interactable) return;
            pressed = true;
            Tween.Scale(transform, PressScale, 0.08f, Ease.OutQuint);
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (!pressed) return;
            pressed = false;
            Tween.Scale(transform, hovered ? HoverScale : 1f, Theme.Normal, Ease.OutBack);
        }

        public void OnPointerClick(PointerEventData e)
        {
            if (e.button != PointerEventData.InputButton.Left) return;
            Click();
        }

        /// <summary>Triggers the button as if clicked (used for keyboard shortcuts).</summary>
        public void Click()
        {
            if (!interactable || !isActiveAndEnabled) return;
            if (Time.unscaledTime - lastClick < Cooldown) return;
            lastClick = Time.unscaledTime;
            UIFeedback.Play(ClickSound);
            UIFeedback.Vibrate(8);
            if (!pressed) Tween.Punch(transform, -0.05f, 0.18f);
            try
            {
                OnClick?.Invoke();
            }
            catch (Exception ex)
            {
                Debug.LogException(ex);
            }
        }

        // ───────────────────────── Factory ─────────────────────────

        public static GameButton Create(Transform parent, string text, ButtonStyle style, Vector2 size, string icon = null, int fontSize = Theme.Body, float radius = Theme.Radius, bool shadow = true)
        {
            var bg = UIFactory.Panel(parent, "Button " + text, Color.white, radius, raycast: true);
            var rt = bg.rectTransform;
            rt.sizeDelta = size;
            var btn = bg.gameObject.AddComponent<GameButton>();
            btn.Background = bg;
            btn.Group = UIFactory.Group(bg);

            if (shadow && style != ButtonStyle.Ghost)
            {
                // Children draw after their parent, so the root stays an invisible hit area and the
                // visible face is a child drawn above the shadow.
                UIFactory.Shadow(rt, 10f, -6f, 0.35f);
                var face = UIFactory.Panel(rt, "Face", Color.white, radius);
                UIFactory.Stretch(face.rectTransform);
                btn.Background = face;
                bg.color = new Color(1f, 1f, 1f, 0f);
            }

            if (style == ButtonStyle.Ghost) UIFactory.Outline(rt, Theme.Stroke, radius);

            float iconSize = Mathf.Min(size.y * 0.5f, 48f);
            if (!string.IsNullOrEmpty(icon))
            {
                btn.IconImage = UIFactory.Icon(rt, icon, iconSize, Color.white);
            }

            if (!string.IsNullOrEmpty(text))
            {
                btn.Label = UIFactory.Label(rt, text, fontSize, Color.white, Theme.Bold);
                UIFactory.Stretch(btn.Label.rectTransform, 16f, 4f, 16f, 4f);
                UIFactory.Fit(btn.Label, Mathf.Max(12, fontSize - 12));
                btn.Label.horizontalOverflow = HorizontalWrapMode.Wrap;
                if (btn.IconImage != null)
                {
                    // Icon on the left, text after it.
                    var irt = btn.IconImage.rectTransform;
                    irt.anchorMin = irt.anchorMax = new Vector2(0f, 0.5f);
                    irt.pivot = new Vector2(0f, 0.5f);
                    irt.anchoredPosition = new Vector2(Mathf.Max(20f, size.y * 0.28f), 0f);
                    UIFactory.Stretch(btn.Label.rectTransform, Mathf.Max(20f, size.y * 0.28f) + iconSize + 8f, 4f, 20f, 4f);
                }
            }

            btn.SetStyle(style);
            return btn;
        }

        /// <summary>A square icon-only button.</summary>
        public static GameButton IconButton(Transform parent, string icon, float size, ButtonStyle style = ButtonStyle.Secondary)
        {
            var btn = Create(parent, null, style, new Vector2(size, size), icon, Theme.Body, size * 0.32f);
            if (btn.IconImage != null)
            {
                btn.IconImage.rectTransform.sizeDelta = new Vector2(size * 0.52f, size * 0.52f);
                btn.IconImage.rectTransform.anchoredPosition = Vector2.zero;
            }
            return btn;
        }
    }
}
