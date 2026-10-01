using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// A short burst of confetti made of plain Images (dots and stars) that fly out, fall and fade. Used for the
    /// level-up, goal and achievement banners. Animated in Update on unscaled time.
    /// </summary>
    public sealed class UIParticleBurst : MonoBehaviour
    {
        private const float Gravity = 900f;

        private sealed class Particle
        {
            public Image Image;
            public RectTransform Rect;
            public Vector2 Position;
            public Vector2 Velocity;
            public float Spin;
            public float Age;
            public float Life;
            public float Size;
            public bool Active;
        }

        private Particle[] _particles;
        private Color[] _palette;
        private int _activeCount;

        public bool IsPlaying => _activeCount > 0;

        public void Build(UIFactory factory, Transform parent, int count)
        {
            var theme = factory.Theme;
            _palette = new[] { theme.accent, theme.vip, theme.flame, theme.textPrimary };
            _particles = new Particle[count];
            for (int i = 0; i < count; i++)
            {
                // Every third particle is a star, the rest are dots.
                var sprite = i % 3 == 0 && theme.iconStar != null ? theme.iconStar : theme.circleSolid;
                var image = factory.Image("Particle " + i, parent, sprite, Color.white);
                UIFactory.Anchor(image.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(14f, 14f));
                image.gameObject.SetActive(false);
                _particles[i] = new Particle { Image = image, Rect = image.rectTransform };
            }
        }

        /// <param name="origin">Burst centre relative to the screen centre.</param>
        public void Play(Vector2 origin)
        {
            if (_particles == null) return;
            foreach (var p in _particles)
            {
                float angle = Random.Range(0f, Mathf.PI * 2f);
                float speed = Random.Range(220f, 620f);
                // Mostly upwards and sideways; gravity pulls the confetti back down.
                p.Velocity = new Vector2(Mathf.Cos(angle) * speed, Mathf.Abs(Mathf.Sin(angle)) * speed * 0.9f + 120f);
                p.Position = origin;
                p.Spin = Random.Range(-360f, 360f);
                p.Life = Random.Range(0.9f, 1.6f);
                p.Size = Random.Range(10f, 22f);
                p.Age = 0f;
                if (!p.Active) _activeCount++;
                p.Active = true;
                var color = _palette[Random.Range(0, _palette.Length)];
                p.Image.color = color;
                p.Rect.sizeDelta = Vector2.one * p.Size;
                p.Image.gameObject.SetActive(true);
                Apply(p);
            }
        }

        private void Update()
        {
            if (_activeCount == 0) return;
            float dt = Time.unscaledDeltaTime;
            foreach (var p in _particles)
            {
                if (!p.Active) continue;
                p.Age += dt;
                if (p.Age >= p.Life)
                {
                    p.Active = false;
                    _activeCount--;
                    p.Image.gameObject.SetActive(false);
                    continue;
                }
                p.Velocity.y -= Gravity * dt;
                p.Velocity.x *= 1f - Mathf.Min(1f, 1.2f * dt);
                p.Position += p.Velocity * dt;
                Apply(p);
            }
        }

        private static void Apply(Particle p)
        {
            float t = p.Age / p.Life;
            p.Rect.anchoredPosition = p.Position;
            p.Rect.localRotation = Quaternion.Euler(0f, 0f, p.Spin * p.Age);
            var color = p.Image.color;
            color.a = 1f - t * t;
            p.Image.color = color;
        }

        public void Clear()
        {
            if (_particles == null) return;
            foreach (var p in _particles)
            {
                p.Active = false;
                p.Image.gameObject.SetActive(false);
            }
            _activeCount = 0;
        }
    }
}
