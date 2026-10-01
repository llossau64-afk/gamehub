using BarberSimulator.Settings;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// A barber pole drawn from slanted colour bands (red, cream, blue, cream) inside a masked rectangle. It is built
    /// from plain Images, so it needs no textures; the bands crawl along the long axis when <c>speed</c> is not zero
    /// (and stand still when the player asked to reduce motion). Horizontal for the logo rule, vertical for the loader.
    /// </summary>
    public sealed class BarberPoleStripe : MonoBehaviour
    {
        private const float Slant = 38f;

        private RectTransform[] _bands;
        private float _period;
        private float _spacing;
        private float _length;
        private bool _vertical;
        private float _speed;
        private float _phase;

        /// <param name="bandWidth">Thickness of one colour band measured across the slanted stripe.</param>
        /// <param name="speed">Pixels per second along the long axis; negative reverses the direction.</param>
        public static BarberPoleStripe Create(UIFactory f, Transform parent, string name, bool vertical, float length, float thickness, float bandWidth, float speed)
        {
            var theme = f.Theme;
            var rect = UIFactory.Rect(name, parent);
            rect.sizeDelta = vertical ? new Vector2(thickness, length) : new Vector2(length, thickness);
            rect.gameObject.AddComponent<RectMask2D>();

            // Thin cream edge so the pole reads as a glass tube against dark panels.
            var colors = new[] { theme.barberRed, new Color(0.93f, 0.89f, 0.82f), theme.barberBlue, new Color(0.93f, 0.89f, 0.82f) };
            float spacing = bandWidth / Mathf.Cos(Slant * Mathf.Deg2Rad);
            int count = Mathf.CeilToInt(length / spacing) + 6;
            var bands = new RectTransform[count];
            for (int i = 0; i < count; i++)
            {
                var image = f.Image("Band " + i, rect, null, colors[i % colors.Length]);
                var rt = image.rectTransform;
                rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
                rt.pivot = new Vector2(0.5f, 0.5f);
                float cover = (vertical ? thickness : thickness) * 3f;
                rt.sizeDelta = vertical ? new Vector2(cover, bandWidth) : new Vector2(bandWidth, cover);
                rt.localRotation = Quaternion.Euler(0f, 0f, vertical ? Slant : -Slant);
                bands[i] = rt;
            }

            var pole = rect.gameObject.AddComponent<BarberPoleStripe>();
            pole._bands = bands;
            pole._spacing = spacing;
            pole._period = spacing * colors.Length;
            pole._length = length;
            pole._vertical = vertical;
            pole._speed = speed;
            pole.Layout();
            pole.enabled = !Mathf.Approximately(speed, 0f);
            return pole;
        }

        private void Update()
        {
            if (LiveSettings.ReduceMotion) return;
            _phase = Mathf.Repeat(_phase + _speed * Time.unscaledDeltaTime, _period);
            Layout();
        }

        private void Layout()
        {
            float start = -_length * 0.5f - _spacing * 2f + _phase;
            for (int i = 0; i < _bands.Length; i++)
            {
                float along = start + i * _spacing;
                _bands[i].anchoredPosition = _vertical ? new Vector2(0f, along) : new Vector2(along, 0f);
            }
        }
    }
}
