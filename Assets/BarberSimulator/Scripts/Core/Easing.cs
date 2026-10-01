using UnityEngine;

namespace BarberSimulator.Core
{
    /// <summary>Small set of easing curves used by camera moves and UI transitions.</summary>
    public static class Easing
    {
        public static float SmoothStep(float t)
        {
            t = Mathf.Clamp01(t);
            return t * t * (3f - 2f * t);
        }

        public static float SmootherStep(float t)
        {
            t = Mathf.Clamp01(t);
            return t * t * t * (t * (t * 6f - 15f) + 10f);
        }

        public static float OutCubic(float t)
        {
            t = Mathf.Clamp01(t) - 1f;
            return t * t * t + 1f;
        }

        public static float InOutSine(float t)
        {
            t = Mathf.Clamp01(t);
            return -(Mathf.Cos(Mathf.PI * t) - 1f) * 0.5f;
        }

        public static float OutBack(float t, float overshoot = 1.2f)
        {
            t = Mathf.Clamp01(t) - 1f;
            return t * t * ((overshoot + 1f) * t + overshoot) + 1f;
        }

        /// <summary>Frame-rate independent exponential smoothing factor.</summary>
        public static float Damp(float sharpness, float deltaTime)
        {
            return 1f - Mathf.Exp(-sharpness * deltaTime);
        }
    }
}
