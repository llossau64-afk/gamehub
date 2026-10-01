using System.Collections;
using BarberSimulator.Core;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>Full-screen colour overlay. The newest fade request always wins.</summary>
    public sealed class ScreenFader : MonoBehaviour, IScreenFade
    {
        private Image _image;
        private int _version;

        public float Alpha => _image != null ? _image.color.a : 0f;

        public void Configure(Image image)
        {
            _image = image;
        }

        public void SetAlpha(float alpha)
        {
            _version++;
            Write(alpha);
        }

        public IEnumerator FadeTo(float alpha, float duration)
        {
            int version = ++_version;
            float from = Alpha;
            float t = 0f;
            while (t < 1f)
            {
                if (version != _version) yield break;
                t += Time.unscaledDeltaTime / Mathf.Max(0.0001f, duration);
                Write(Mathf.Lerp(from, alpha, Easing.SmoothStep(t)));
                yield return null;
            }
            if (version == _version) Write(alpha);
        }

        private void Write(float alpha)
        {
            var c = _image.color;
            c.a = Mathf.Clamp01(alpha);
            _image.color = c;
            _image.enabled = c.a > 0.001f;
            _image.raycastTarget = c.a > 0.95f;
        }
    }
}
