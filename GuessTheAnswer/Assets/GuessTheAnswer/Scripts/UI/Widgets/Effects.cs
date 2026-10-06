using System.Collections.Generic;
using GuessTheAnswer.Audio;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    public enum ToastKind
    {
        Info,
        Success,
        Error,
    }

    /// <summary>Short messages at the top of the screen. Pooled; a new toast replaces an identical visible one.</summary>
    public sealed class Toasts : MonoBehaviour
    {
        RectTransform root;
        readonly List<(RectTransform rt, Text text, Image dot, CanvasGroup group, float until)> items = new List<(RectTransform, Text, Image, CanvasGroup, float)>();

        public static Toasts Create(Transform parent)
        {
            var root = UIFactory.Rect("Toasts", parent);
            UIFactory.Stretch(root);
            var t = root.gameObject.AddComponent<Toasts>();
            t.root = root;
            return t;
        }

        public void Show(string message, ToastKind kind)
        {
            if (string.IsNullOrEmpty(message)) return;
            foreach (var it in items)
            {
                if (it.text.text == message && it.group.alpha > 0.5f) return;
            }

            var item = GetFree();
            item.text.text = message;
            item.dot.color = kind == ToastKind.Error ? Theme.Danger : kind == ToastKind.Success ? Theme.Success : Theme.Accent;
            float width = Mathf.Clamp(item.text.preferredWidth + 110f, 360f, 1200f);
            item.rt.sizeDelta = new Vector2(width, 76f);
            item.rt.gameObject.SetActive(true);
            item.rt.SetAsLastSibling();
            int index = items.FindIndex(x => x.rt == item.rt);
            items[index] = (item.rt, item.text, item.dot, item.group, Time.unscaledTime + 2.6f);
            Layout();
            item.group.alpha = 0f;
            Tween.Fade(item.group, 1f, Theme.Normal);
            Tween.ScaleFrom(item.rt, 0.9f, 1f, Theme.Normal);
            if (kind == ToastKind.Error) UIFeedback.Play(Sfx.Error);
        }

        (RectTransform rt, Text text, Image dot, CanvasGroup group, float until) GetFree()
        {
            foreach (var it in items)
            {
                if (!it.rt.gameObject.activeSelf) return it;
            }
            var bg = UIFactory.Panel(root, "Toast", Theme.SurfaceRaised, 38f);
            var rt = bg.rectTransform;
            rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(0.5f, 1f);
            UIFactory.Shadow(rt, 16f, -6f, 0.45f);
            var dot = UIFactory.Image(rt, "Dot", Theme.Accent, Shapes.Circle);
            UIFactory.Place(dot.rectTransform, new Vector2(0f, 0.5f), new Vector2(34f, 0f), new Vector2(16f, 16f), new Vector2(0f, 0.5f));
            var text = UIFactory.Label(rt, "", Theme.Body, Theme.Text, Theme.SemiBold);
            UIFactory.Stretch(text.rectTransform, 64f, 0f, 30f, 0f);
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            var entry = (rt, text, dot, UIFactory.Group(rt), 0f);
            entry.Item4.blocksRaycasts = false;
            items.Add(entry);
            return entry;
        }

        void Layout()
        {
            float y = -104f; // below the reconnect banner
            for (int i = items.Count - 1; i >= 0; i--)
            {
                var it = items[i];
                if (!it.rt.gameObject.activeSelf) continue;
                Tween.Move(it.rt, new Vector2(0f, y), Theme.Normal);
                y -= 90f;
            }
        }

        void Update()
        {
            bool changed = false;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (!it.rt.gameObject.activeSelf || Time.unscaledTime < it.until) continue;
                var go = it.rt.gameObject;
                items[i] = (it.rt, it.text, it.dot, it.group, float.MaxValue);
                Tween.Fade(it.group, 0f, Theme.Normal, Ease.OutCubic, 0f, () => go.SetActive(false));
                changed = true;
            }
            if (changed) Layout();
        }
    }

    /// <summary>"+100", "+25 SPEED" style numbers that rise and fade. Pooled.</summary>
    public sealed class FloatingText : MonoBehaviour
    {
        readonly Stack<Text> pool = new Stack<Text>();
        RectTransform root;

        public static FloatingText Create(Transform parent)
        {
            var root = UIFactory.Rect("Floating Text", parent);
            UIFactory.Stretch(root);
            var f = root.gameObject.AddComponent<FloatingText>();
            f.root = root;
            return f;
        }

        public void Spawn(string text, Vector2 position, Color color, int size = Theme.H3, float delay = 0f, float rise = 120f)
        {
            Text t = pool.Count > 0 ? pool.Pop() : UIFactory.Label(root, "", size, color, Theme.Bold);
            t.gameObject.SetActive(true);
            t.text = text;
            t.color = color;
            t.fontSize = size;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.sizeDelta = new Vector2(600f, 80f);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = position;
            rt.localScale = Vector3.zero;
            var group = UIFactory.Group(t);
            group.alpha = 1f;
            Tween.Scale(rt, 1f, 0.3f, Ease.OutBack, delay);
            Tween.Move(rt, position + new Vector2(0f, rise), 1.1f, Ease.OutCubic, delay);
            Tween.Fade(group, 0f, 0.35f, Ease.InCubic, delay + 0.8f, () =>
            {
                t.gameObject.SetActive(false);
                pool.Push(t);
            });
        }
    }

    /// <summary>Light confetti for the winner screen: a pool of small rectangles with simple physics.</summary>
    public sealed class Confetti : MonoBehaviour
    {
        struct Piece
        {
            public RectTransform Rect;
            public Vector2 Velocity;
            public float Spin;
            public float Life;
        }

        Piece[] pieces = new Piece[0];
        RectTransform root;
        bool running;

        static readonly Color[] Colors = { Theme.Accent, Theme.Red, Theme.Blue, Theme.Success, Color.white, Theme.Hex("#B57BFF") };

        public static Confetti Create(Transform parent, int count)
        {
            var root = UIFactory.Rect("Confetti", parent);
            UIFactory.Stretch(root);
            var c = root.gameObject.AddComponent<Confetti>();
            c.root = root;
            c.pieces = new Piece[count];
            for (int i = 0; i < count; i++)
            {
                var img = UIFactory.Image(root, "Piece", Colors[i % Colors.Length], Shapes.White);
                img.rectTransform.sizeDelta = new Vector2(14f + (i % 3) * 4f, 22f + (i % 4) * 4f);
                img.gameObject.SetActive(false);
                c.pieces[i] = new Piece { Rect = img.rectTransform };
            }
            return c;
        }

        public void Burst(int amount)
        {
            var size = root.rect.size;
            amount = Mathf.Min(amount, pieces.Length);
            for (int i = 0; i < amount; i++)
            {
                ref var p = ref pieces[i];
                p.Rect.gameObject.SetActive(true);
                p.Rect.anchorMin = p.Rect.anchorMax = new Vector2(0.5f, 0.5f);
                bool left = i % 2 == 0;
                p.Rect.anchoredPosition = new Vector2(left ? -size.x * 0.45f : size.x * 0.45f, -size.y * 0.45f);
                p.Velocity = new Vector2((left ? 1f : -1f) * Random.Range(250f, 900f), Random.Range(900f, 1700f));
                p.Spin = Random.Range(-540f, 540f);
                p.Life = Random.Range(2.2f, 3.4f);
            }
            running = true;
        }

        public void Stop()
        {
            running = false;
            foreach (var p in pieces) p.Rect.gameObject.SetActive(false);
        }

        void Update()
        {
            if (!running) return;
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            bool any = false;
            for (int i = 0; i < pieces.Length; i++)
            {
                ref var p = ref pieces[i];
                if (!p.Rect.gameObject.activeSelf) continue;
                p.Life -= dt;
                if (p.Life <= 0f)
                {
                    p.Rect.gameObject.SetActive(false);
                    continue;
                }
                any = true;
                p.Velocity += new Vector2(-p.Velocity.x * 0.9f * dt, -1500f * dt);
                p.Velocity.y = Mathf.Max(p.Velocity.y, -420f);
                p.Rect.anchoredPosition += p.Velocity * dt;
                p.Rect.Rotate(0f, 0f, p.Spin * dt);
            }
            running = any;
        }
    }
}
