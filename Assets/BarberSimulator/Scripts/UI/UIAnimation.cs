using System.Collections;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.UI
{
    /// <summary>Coroutine tweens on unscaled time (UI keeps animating while the game is paused).</summary>
    public static class UIAnimation
    {
        public static IEnumerator Fade(CanvasGroup group, float to, float duration)
        {
            float from = group.alpha;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.unscaledDeltaTime / Mathf.Max(0.0001f, duration);
                group.alpha = Mathf.Lerp(from, to, Easing.SmoothStep(t));
                yield return null;
            }
            group.alpha = to;
        }

        public static IEnumerator FadeAndSlide(CanvasGroup group, RectTransform rect, float toAlpha, Vector2 fromPos, Vector2 toPos, float duration)
        {
            float fromAlpha = group.alpha;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.unscaledDeltaTime / Mathf.Max(0.0001f, duration);
                float e = Easing.OutCubic(t);
                group.alpha = Mathf.Lerp(fromAlpha, toAlpha, Easing.SmoothStep(t));
                rect.anchoredPosition = Vector2.LerpUnclamped(fromPos, toPos, e);
                yield return null;
            }
            group.alpha = toAlpha;
            rect.anchoredPosition = toPos;
        }

        public static IEnumerator Scale(Transform target, Vector3 from, Vector3 to, float duration, bool overshoot = false)
        {
            float t = 0f;
            while (t < 1f)
            {
                t += Time.unscaledDeltaTime / Mathf.Max(0.0001f, duration);
                float e = overshoot ? Easing.OutBack(t, 1.4f) : Easing.OutCubic(t);
                target.localScale = Vector3.LerpUnclamped(from, to, e);
                yield return null;
            }
            target.localScale = to;
        }

        public static IEnumerator Wait(float seconds)
        {
            float t = 0f;
            while (t < seconds)
            {
                t += Time.unscaledDeltaTime;
                yield return null;
            }
        }

        public static void SetVisible(CanvasGroup group, bool visible)
        {
            group.alpha = visible ? 1f : 0f;
            group.interactable = visible;
            group.blocksRaycasts = visible;
        }
    }
}
