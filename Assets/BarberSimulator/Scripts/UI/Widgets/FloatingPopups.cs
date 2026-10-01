using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Pooled "+$25" / "+15 XP" texts that pop in, float upwards and fade. Driven by Update on unscaled time, so
    /// nothing needs a coroutine and a hidden HUD simply stops animating them.
    /// </summary>
    public sealed class FloatingPopups : MonoBehaviour
    {
        private const float Life = 1.3f;
        private const float Rise = 110f;

        private sealed class Slot
        {
            public Text Label;
            public RectTransform Rect;
            public Vector2 Origin;
            public Color Color;
            public float Age;
            public bool Active;
        }

        private Slot[] _slots;
        private int _next;

        public void Build(UIFactory factory, Transform parent, int count)
        {
            var theme = factory.Theme;
            _slots = new Slot[count];
            for (int i = 0; i < count; i++)
            {
                var label = factory.Label("Popup " + i, parent, theme.displayFont, 40, Color.white, TextAnchor.MiddleCenter);
                label.horizontalOverflow = HorizontalWrapMode.Overflow;
                UIFactory.Anchor(label.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(320f, 60f));
                UIFactory.SoftShadow(label, new Color(0f, 0f, 0f, 0.75f), new Vector2(0f, -2f));
                label.gameObject.SetActive(false);
                _slots[i] = new Slot { Label = label, Rect = label.rectTransform };
            }
        }

        /// <param name="origin">Start position relative to the screen centre.</param>
        public void Spawn(string text, Color color, Vector2 origin, int fontSize = 40)
        {
            if (_slots == null || _slots.Length == 0 || string.IsNullOrEmpty(text)) return;
            // Reuse the next slot in turn: under a flood the oldest popup is the one that gets cut short.
            var slot = _slots[_next];
            _next = (_next + 1) % _slots.Length;
            slot.Label.text = text;
            slot.Label.fontSize = fontSize;
            slot.Color = color;
            slot.Origin = origin;
            slot.Age = 0f;
            slot.Active = true;
            slot.Rect.anchoredPosition = origin;
            slot.Label.gameObject.SetActive(true);
            Apply(slot);
        }

        private void Update()
        {
            if (_slots == null) return;
            float dt = Time.unscaledDeltaTime;
            foreach (var slot in _slots)
            {
                if (!slot.Active) continue;
                slot.Age += dt;
                if (slot.Age >= Life)
                {
                    slot.Active = false;
                    slot.Label.gameObject.SetActive(false);
                    continue;
                }
                Apply(slot);
            }
        }

        private static void Apply(Slot slot)
        {
            float t = Mathf.Clamp01(slot.Age / Life);
            slot.Rect.anchoredPosition = slot.Origin + new Vector2(0f, Rise * Core.Easing.OutCubic(t));
            // Quick pop-in, hold, then fade over the last third.
            float pop = Mathf.Clamp01(slot.Age / 0.18f);
            slot.Rect.localScale = Vector3.one * Mathf.LerpUnclamped(0.6f, 1f, Core.Easing.OutBack(pop, 2f));
            var color = slot.Color;
            color.a = slot.Color.a * Mathf.Clamp01(Mathf.Min(slot.Age / 0.08f, (1f - t) / 0.35f));
            slot.Label.color = color;
        }

        public void Clear()
        {
            if (_slots == null) return;
            foreach (var slot in _slots)
            {
                slot.Active = false;
                slot.Label.gameObject.SetActive(false);
            }
        }
    }
}
