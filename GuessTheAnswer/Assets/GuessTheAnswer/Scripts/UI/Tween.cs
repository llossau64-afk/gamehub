using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    public enum Ease
    {
        Linear,
        OutCubic,
        InCubic,
        InOutCubic,
        OutQuint,
        OutBack,
        OutElastic,
    }

    /// <summary>
    /// Minimal tween engine for UI motion. One Update drives every tween; finished entries are recycled.
    /// A tween is identified by (target, channel): starting a new one on the same channel replaces the old one,
    /// so rapid input never stacks animations. Uses unscaled time.
    /// </summary>
    public sealed class Tween : MonoBehaviour
    {
        sealed class Item
        {
            public UnityEngine.Object Target;
            public int Channel;
            public float Elapsed;
            public float Duration;
            public float Delay;
            public Ease Ease;
            public Action<float> Step;
            public Action Done;
        }

        static Tween runner;
        readonly List<Item> active = new List<Item>(64);
        readonly Stack<Item> pool = new Stack<Item>(64);

        public const int ChFade = 1, ChScale = 2, ChMove = 3, ChColor = 4, ChCustom = 5, ChShake = 6, ChFill = 7, ChRotate = 8;

        static Tween Runner
        {
            get
            {
                if (runner == null)
                {
                    var go = new GameObject("[GTA] Tween");
                    DontDestroyOnLoad(go);
                    runner = go.AddComponent<Tween>();
                }
                return runner;
            }
        }

        public static float Evaluate(Ease ease, float t)
        {
            switch (ease)
            {
                case Ease.Linear: return t;
                case Ease.InCubic: return t * t * t;
                case Ease.InOutCubic: return t < 0.5f ? 4f * t * t * t : 1f - Mathf.Pow(-2f * t + 2f, 3f) / 2f;
                case Ease.OutQuint: return 1f - Mathf.Pow(1f - t, 5f);
                case Ease.OutBack:
                    {
                        const float c1 = 1.70158f, c3 = c1 + 1f;
                        return 1f + c3 * Mathf.Pow(t - 1f, 3f) + c1 * Mathf.Pow(t - 1f, 2f);
                    }
                case Ease.OutElastic:
                    if (t <= 0f || t >= 1f) return t;
                    return Mathf.Pow(2f, -10f * t) * Mathf.Sin((t * 10f - 0.75f) * (2f * Mathf.PI / 3f)) + 1f;
                default: return 1f - Mathf.Pow(1f - t, 3f);
            }
        }

        /// <summary>Runs step(0..1 eased) for the duration. Replaces any tween on the same target and channel.</summary>
        public static void Run(UnityEngine.Object target, int channel, float duration, Action<float> step, Ease ease = Ease.OutCubic, float delay = 0f, Action done = null)
        {
            var r = Runner;
            r.Remove(target, channel);
            Item item = r.pool.Count > 0 ? r.pool.Pop() : new Item();
            item.Target = target;
            item.Channel = channel;
            item.Elapsed = 0f;
            item.Duration = Mathf.Max(0.0001f, duration);
            item.Delay = delay;
            item.Ease = ease;
            item.Step = step;
            item.Done = done;
            r.active.Add(item);
            if (delay <= 0f) step(0f);
        }

        public static void Kill(UnityEngine.Object target, int channel = 0)
        {
            if (runner != null) runner.Remove(target, channel);
        }

        void Remove(UnityEngine.Object target, int channel)
        {
            for (int i = active.Count - 1; i >= 0; i--)
            {
                var it = active[i];
                if (it.Target == target && (channel == 0 || it.Channel == channel))
                {
                    active.RemoveAt(i);
                    Recycle(it);
                }
            }
        }

        void Recycle(Item it)
        {
            it.Target = null;
            it.Step = null;
            it.Done = null;
            pool.Push(it);
        }

        void Update()
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.1f);
            for (int i = 0; i < active.Count; i++)
            {
                var it = active[i];
                if (it.Target == null)
                {
                    active.RemoveAt(i--);
                    Recycle(it);
                    continue;
                }
                if (it.Delay > 0f)
                {
                    it.Delay -= dt;
                    if (it.Delay > 0f) continue;
                }
                it.Elapsed += dt;
                float t = Mathf.Clamp01(it.Elapsed / it.Duration);
                var step = it.Step;
                var done = it.Done;
                bool finished = t >= 1f;
                if (finished)
                {
                    active.RemoveAt(i--);
                    Recycle(it);
                }
                try
                {
                    step?.Invoke(Evaluate(it.Ease, t));
                    if (finished) done?.Invoke();
                }
                catch (Exception e)
                {
                    Debug.LogException(e);
                }
            }
        }

        // ───────────────────────── Helpers ─────────────────────────

        public static void Fade(CanvasGroup group, float to, float duration, Ease ease = Ease.OutCubic, float delay = 0f, Action done = null)
        {
            if (group == null) return;
            float from = group.alpha;
            Run(group, ChFade, duration, t => group.alpha = Mathf.LerpUnclamped(from, to, t), ease, delay, done);
        }

        public static void Scale(Transform target, float to, float duration, Ease ease = Ease.OutCubic, float delay = 0f, Action done = null)
        {
            if (target == null) return;
            Vector3 from = target.localScale;
            Vector3 end = new Vector3(to, to, 1f);
            Run(target, ChScale, duration, t => target.localScale = Vector3.LerpUnclamped(from, end, t), ease, delay, done);
        }

        public static void ScaleFrom(Transform target, float from, float to, float duration, Ease ease = Ease.OutBack, float delay = 0f)
        {
            if (target == null) return;
            target.localScale = new Vector3(from, from, 1f);
            Scale(target, to, duration, ease, delay);
        }

        public static void Move(RectTransform target, Vector2 to, float duration, Ease ease = Ease.OutCubic, float delay = 0f, Action done = null)
        {
            if (target == null) return;
            Vector2 from = target.anchoredPosition;
            Run(target, ChMove, duration, t => target.anchoredPosition = Vector2.LerpUnclamped(from, to, t), ease, delay, done);
        }

        public static void ColorTo(Graphic target, Color to, float duration, Ease ease = Ease.OutCubic, float delay = 0f)
        {
            if (target == null) return;
            Color from = target.color;
            Run(target, ChColor, duration, t => target.color = Color.LerpUnclamped(from, to, t), ease, delay);
        }

        /// <summary>Quick scale bounce (e.g. on press or when a value changes).</summary>
        public static void Punch(Transform target, float amount = 0.08f, float duration = 0.25f)
        {
            if (target == null) return;
            Run(target, ChScale, duration, t =>
            {
                float s = 1f + amount * Mathf.Sin(t * Mathf.PI) * (1f - t * 0.5f);
                target.localScale = new Vector3(s, s, 1f);
            }, Ease.Linear);
        }

        /// <summary>Small horizontal shake for wrong answers.</summary>
        public static void Shake(RectTransform target, float strength = 14f, float duration = 0.35f)
        {
            if (target == null) return;
            Vector2 origin = target.anchoredPosition;
            Run(target, ChShake, duration, t =>
            {
                float damp = 1f - t;
                target.anchoredPosition = origin + new Vector2(Mathf.Sin(t * Mathf.PI * 8f) * strength * damp, 0f);
            }, Ease.Linear, 0f, () => target.anchoredPosition = origin);
        }
    }
}
