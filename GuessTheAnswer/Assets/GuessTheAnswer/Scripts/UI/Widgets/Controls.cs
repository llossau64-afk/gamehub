using System;
using System.Collections.Generic;
using GuessTheAnswer.Audio;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>A row of option chips with one selected (e.g. 5 / 10 / 15 rounds).</summary>
    public sealed class Segmented : MonoBehaviour
    {
        readonly List<GameButton> buttons = new List<GameButton>();
        Action<int> onChange;
        bool interactable = true;

        public int Selected { get; private set; } = -1;

        public static Segmented Create(Transform parent, string[] labels, int selected, Action<int> onChange, Vector2 size, int fontSize = Theme.Small)
        {
            var bg = UIFactory.Panel(parent, "Segmented", Theme.Surface, Theme.RadiusSmall);
            var rt = bg.rectTransform;
            rt.sizeDelta = size;
            var seg = bg.gameObject.AddComponent<Segmented>();
            seg.onChange = onChange;

            var row = UIFactory.Rect("Options", rt);
            UIFactory.Stretch(row, 6f, 6f, 6f, 6f);
            UIFactory.Row(row, 6f, TextAnchor.MiddleCenter, true);
            for (int i = 0; i < labels.Length; i++)
            {
                int index = i;
                var b = GameButton.Create(row, labels[i], ButtonStyle.Ghost, new Vector2(10f, size.y - 12f), null, fontSize, Theme.RadiusSmall - 4f, false);
                // Chips have no outline; the selected chip is filled with the accent colour.
                var outline = b.transform.Find("Outline");
                if (outline != null) Destroy(outline.gameObject);
                b.HoverScale = 1.0f;
                b.OnClick = () => seg.Choose(index, true);
                seg.buttons.Add(b);
            }
            seg.SetSelected(selected, false);
            return seg;
        }

        public void SetLabels(string[] labels)
        {
            for (int i = 0; i < buttons.Count && i < labels.Length; i++) buttons[i].SetLabel(labels[i]);
        }

        public void SetSelected(int index, bool notify)
        {
            Choose(index, notify);
        }

        void Choose(int index, bool notify)
        {
            if (!interactable && notify) return;
            bool changed = index != Selected;
            Selected = index;
            for (int i = 0; i < buttons.Count; i++) buttons[i].SetSelected(i == index);
            if (changed && notify) onChange?.Invoke(index);
        }

        public void SetInteractable(bool value)
        {
            interactable = value;
            foreach (var b in buttons)
            {
                b.Interactable = value;
                // Read-only chips stay readable: only the non-selected ones dim.
                if (!value && b.Group != null) b.Group.alpha = buttons.IndexOf(b) == Selected ? 1f : 0.45f;
            }
        }
    }

    /// <summary>A horizontal slider for volumes (0..1), usable by mouse drag or touch.</summary>
    public sealed class ValueSlider : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        RectTransform track;
        RectTransform fill;
        RectTransform knob;
        Action<float> onChange;
        float value;

        public float Value => value;

        public static ValueSlider Create(Transform parent, float value, Action<float> onChange, Vector2 size)
        {
            var root = UIFactory.Rect("Slider", parent);
            root.sizeDelta = size;
            var hit = root.gameObject.AddComponent<Image>();
            hit.color = new Color(0f, 0f, 0f, 0f);
            var slider = root.gameObject.AddComponent<ValueSlider>();
            slider.onChange = onChange;

            var trackImg = UIFactory.Panel(root, "Track", Theme.Surface, 8f);
            slider.track = trackImg.rectTransform;
            slider.track.anchorMin = new Vector2(0f, 0.5f);
            slider.track.anchorMax = new Vector2(1f, 0.5f);
            slider.track.sizeDelta = new Vector2(-size.y, 14f);
            slider.track.anchoredPosition = Vector2.zero;

            var fillImg = UIFactory.Panel(slider.track, "Fill", Theme.Accent, 8f);
            slider.fill = fillImg.rectTransform;
            slider.fill.anchorMin = new Vector2(0f, 0f);
            slider.fill.anchorMax = new Vector2(0f, 1f);
            slider.fill.pivot = new Vector2(0f, 0.5f);

            var knobImg = UIFactory.Image(slider.track, "Knob", Color.white, Shapes.Circle);
            slider.knob = knobImg.rectTransform;
            slider.knob.anchorMin = slider.knob.anchorMax = new Vector2(0f, 0.5f);
            slider.knob.sizeDelta = new Vector2(size.y * 0.75f, size.y * 0.75f);
            slider.SetValue(value, false);
            return slider;
        }

        public void SetValue(float v, bool notify)
        {
            value = Mathf.Clamp01(v);
            float width = track.rect.width > 1f ? track.rect.width : ((RectTransform)transform).sizeDelta.x - ((RectTransform)transform).sizeDelta.y;
            fill.sizeDelta = new Vector2(width * value, 0f);
            knob.anchoredPosition = new Vector2(width * value, 0f);
            if (notify) onChange?.Invoke(value);
        }

        void SetFromPointer(PointerEventData e)
        {
            if (RectTransformUtility.ScreenPointToLocalPointInRectangle(track, e.position, e.pressEventCamera, out var local))
            {
                float width = Mathf.Max(1f, track.rect.width);
                SetValue((local.x - track.rect.xMin) / width, true);
            }
        }

        public void OnPointerDown(PointerEventData e)
        {
            SetFromPointer(e);
            Tween.Scale(knob, 1.2f, Theme.Fast);
        }

        public void OnDrag(PointerEventData e) => SetFromPointer(e);

        public void OnPointerUp(PointerEventData e)
        {
            Tween.Scale(knob, 1f, Theme.Fast);
            UIFeedback.Play(Sfx.Click);
        }

        void OnRectTransformDimensionsChange()
        {
            if (track != null) SetValue(value, false);
        }
    }

    /// <summary>An on/off switch.</summary>
    public sealed class ToggleSwitch : MonoBehaviour, IPointerClickHandler
    {
        Image bg;
        RectTransform knob;
        Action<bool> onChange;

        public bool IsOn { get; private set; }

        public static ToggleSwitch Create(Transform parent, bool on, Action<bool> onChange)
        {
            var bg = UIFactory.Panel(parent, "Toggle", Theme.Surface, 26f, raycast: true);
            bg.rectTransform.sizeDelta = new Vector2(96f, 52f);
            var t = bg.gameObject.AddComponent<ToggleSwitch>();
            t.bg = bg;
            t.onChange = onChange;
            var k = UIFactory.Image(bg.rectTransform, "Knob", Color.white, Shapes.Circle);
            t.knob = k.rectTransform;
            t.knob.anchorMin = t.knob.anchorMax = new Vector2(0.5f, 0.5f);
            t.knob.sizeDelta = new Vector2(40f, 40f);
            t.Set(on, false, true);
            return t;
        }

        public void Set(bool on, bool notify, bool instant = false)
        {
            IsOn = on;
            var target = new Vector2(on ? 22f : -22f, 0f);
            if (instant)
            {
                knob.anchoredPosition = target;
                bg.color = on ? Theme.Accent : Theme.Surface;
            }
            else
            {
                Tween.Move(knob, target, Theme.Fast, Ease.OutBack);
                Tween.ColorTo(bg, on ? Theme.Accent : Theme.Surface, Theme.Fast);
            }
            if (notify) onChange?.Invoke(on);
        }

        public void OnPointerClick(PointerEventData e)
        {
            UIFeedback.Play(Sfx.Click);
            UIFeedback.Vibrate(8);
            Set(!IsOn, true);
        }
    }

    /// <summary>Round avatar with the player's initial, in one of the avatar colours.</summary>
    public sealed class Avatar : MonoBehaviour
    {
        Image circle;
        Text initial;
        Image ring;

        public static Avatar Create(Transform parent, float size)
        {
            var root = UIFactory.Rect("Avatar", parent);
            root.sizeDelta = new Vector2(size, size);
            var a = root.gameObject.AddComponent<Avatar>();
            a.ring = UIFactory.Image(root, "Ring", Theme.Accent, Shapes.Ring);
            UIFactory.Stretch(a.ring.rectTransform, -6f, -6f, -6f, -6f);
            a.ring.enabled = false;
            a.circle = UIFactory.Image(root, "Circle", Color.white, Shapes.Circle);
            UIFactory.Stretch(a.circle.rectTransform);
            a.initial = UIFactory.Label(root, "?", Mathf.RoundToInt(size * 0.46f), Color.white, Theme.Bold);
            UIFactory.Stretch(a.initial.rectTransform);
            return a;
        }

        public void Set(string name, int avatar, bool isBot = false)
        {
            circle.color = isBot ? Theme.SurfaceHover : Theme.AvatarColor(avatar);
            string n = string.IsNullOrEmpty(name) ? "?" : name.Trim();
            if (isBot && n.StartsWith("Bot ", StringComparison.Ordinal)) n = n.Substring(4);
            initial.text = n.Length > 0 ? char.ToUpperInvariant(n[0]).ToString() : "?";
            initial.color = isBot ? Theme.TextMuted : Color.white;
        }

        public void SetHighlight(bool on, Color color)
        {
            ring.enabled = on;
            ring.color = color;
        }

        public void SetEmpty()
        {
            circle.color = Theme.Surface;
            initial.text = "+";
            initial.color = Theme.TextFaint;
            ring.enabled = false;
        }
    }

    /// <summary>A rotating arc used while waiting.</summary>
    public sealed class Spinner : MonoBehaviour
    {
        public float Speed = 300f;

        public static Spinner Create(Transform parent, float size, Color color)
        {
            var img = UIFactory.Image(parent, "Spinner", color, Shapes.Ring);
            img.type = Image.Type.Filled;
            img.fillMethod = Image.FillMethod.Radial360;
            img.fillAmount = 0.28f;
            img.rectTransform.sizeDelta = new Vector2(size, size);
            return img.gameObject.AddComponent<Spinner>();
        }

        void Update()
        {
            transform.Rotate(0f, 0f, -Speed * Time.unscaledDeltaTime);
        }
    }
}
