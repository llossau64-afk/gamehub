using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Game
{
    public enum AnswerState
    {
        Idle,
        Selected,
        Correct,
        Wrong,
        Removed,
        Faded,
    }

    /// <summary>One of the four large answer cards (A–D). Big touch target, instant press feedback.</summary>
    public sealed class AnswerCard : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerEnterHandler, IPointerExitHandler, IPointerClickHandler
    {
        public int Index;
        public Action<int> Clicked;

        RectTransform rt;
        Image face;
        Image glow;
        Image outline;
        Image letterBadge;
        Text letter;
        Text text;
        Image resultIcon;
        RectTransform tagRect;
        Text tagText;
        CanvasGroup group;

        bool interactable;
        bool hovered;
        AnswerState state;
        Vector2 home;

        public RectTransform Rect => rt;
        public AnswerState State => state;

        public static AnswerCard Create(Transform parent, int index, Vector2 size)
        {
            var root = UIFactory.Rect("Answer " + (char)('A' + index), parent);
            root.sizeDelta = size;
            var hit = root.gameObject.AddComponent<Image>();
            hit.color = new Color(0f, 0f, 0f, 0f);
            var card = root.gameObject.AddComponent<AnswerCard>();
            card.Index = index;
            card.rt = root;
            card.group = UIFactory.Group(root);

            card.glow = UIFactory.Image(root, "Glow", new Color(Theme.Success.r, Theme.Success.g, Theme.Success.b, 0f), Shapes.SoftShadow);
            card.glow.type = Image.Type.Sliced;
            card.glow.pixelsPerUnitMultiplier = Shapes.ShadowBorder / 50f;
            UIFactory.Stretch(card.glow.rectTransform, -50f, -50f, -50f, -50f);
            UIFactory.Shadow(root, 12f, -8f, 0.35f);

            card.face = UIFactory.Panel(root, "Face", Theme.SurfaceRaised, Theme.Radius);
            UIFactory.Stretch(card.face.rectTransform);
            card.outline = UIFactory.Outline(root, new Color(1f, 1f, 1f, 0.06f), Theme.Radius);

            card.letterBadge = UIFactory.Panel(root, "Badge", new Color(1f, 0.78f, 0.24f, 0.14f), 18f);
            UIFactory.Place(card.letterBadge.rectTransform, new Vector2(0f, 0.5f), new Vector2(22f, 0f), new Vector2(84f, 84f), new Vector2(0f, 0.5f));
            card.letter = UIFactory.Label(card.letterBadge.rectTransform, ((char)('A' + index)).ToString(), Theme.H2, Theme.Accent, Theme.Bold);
            UIFactory.Stretch(card.letter.rectTransform);

            card.text = UIFactory.Label(root, "", Theme.H3, Theme.Text, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Stretch(card.text.rectTransform, 128f, 10f, 80f, 10f);
            UIFactory.Fit(card.text, 20);

            card.resultIcon = UIFactory.Icon(root, "check", 56f, Color.white);
            UIFactory.Place(card.resultIcon.rectTransform, new Vector2(1f, 0.5f), new Vector2(-24f, 0f), new Vector2(56f, 56f), new Vector2(1f, 0.5f));
            card.resultIcon.enabled = false;

            var tagImg = UIFactory.Panel(root, "Tag", Theme.Accent, 14f);
            card.tagRect = tagImg.rectTransform;
            UIFactory.Place(card.tagRect, new Vector2(1f, 1f), new Vector2(-18f, 16f), new Vector2(180f, 36f), new Vector2(1f, 0.5f));
            card.tagText = UIFactory.Label(card.tagRect, "TEAMMATE", Theme.Tiny, Theme.TextOnAccent, Theme.Bold);
            UIFactory.Stretch(card.tagText.rectTransform);
            card.tagRect.gameObject.SetActive(false);
            return card;
        }

        void Awake()
        {
            home = Vector2.zero;
        }

        public void SetHome(Vector2 position)
        {
            home = position;
            rt.anchoredPosition = position;
        }

        public void SetText(string answer)
        {
            text.text = answer ?? "";
        }

        public void SetInteractable(bool value)
        {
            interactable = value;
            if (!value && hovered)
            {
                hovered = false;
                Tween.Scale(rt, 1f, Theme.Fast);
            }
            RefreshFace();
        }

        public void SetTag(string label, Color color)
        {
            bool show = !string.IsNullOrEmpty(label);
            if (show && !tagRect.gameObject.activeSelf) Tween.ScaleFrom(tagRect, 0.5f, 1f, 0.3f, Ease.OutBack);
            tagRect.gameObject.SetActive(show);
            if (!show) return;
            tagText.text = label;
            tagRect.GetComponent<Image>().color = color;
            tagRect.sizeDelta = new Vector2(Mathf.Max(120f, tagText.preferredWidth + 32f), 36f);
        }

        public void SetState(AnswerState next, bool animate)
        {
            var previous = state;
            state = next;
            RefreshFace();
            resultIcon.enabled = next == AnswerState.Correct || next == AnswerState.Wrong;
            if (next == AnswerState.Correct) resultIcon.sprite = Shapes.Icon("check");
            if (next == AnswerState.Wrong) resultIcon.sprite = Shapes.Icon("close");

            float alpha = next == AnswerState.Removed ? 0.18f : next == AnswerState.Faded ? 0.45f : 1f;
            if (animate) Tween.Fade(group, alpha, Theme.Normal);
            else group.alpha = alpha;

            if (!animate || previous == next) return;
            switch (next)
            {
                case AnswerState.Selected:
                    Tween.Punch(rt, -0.05f, 0.2f);
                    break;
                case AnswerState.Correct:
                    Tween.Punch(rt, 0.07f, 0.35f);
                    var c = Theme.Success;
                    Tween.Run(glow, Tween.ChColor, 0.9f, t => glow.color = new Color(c.r, c.g, c.b, Mathf.Sin(t * Mathf.PI) * 0.75f), Ease.Linear);
                    break;
                case AnswerState.Wrong:
                    Tween.Shake(rt, 16f, 0.4f);
                    break;
                case AnswerState.Removed:
                    Tween.Scale(rt, 0.96f, Theme.Normal);
                    break;
            }
        }

        void RefreshFace()
        {
            Color faceColor;
            Color textColor = Theme.Text;
            Color letterColor = Theme.Accent;
            Color badge = new Color(1f, 0.78f, 0.24f, 0.14f);
            Color outlineColor = new Color(1f, 1f, 1f, 0.06f);
            switch (state)
            {
                case AnswerState.Selected:
                    faceColor = Theme.SurfaceHover;
                    outlineColor = Theme.Accent;
                    break;
                case AnswerState.Correct:
                    faceColor = Theme.Success;
                    textColor = Theme.TextOnAccent;
                    letterColor = Theme.TextOnAccent;
                    badge = new Color(0f, 0f, 0f, 0.12f);
                    break;
                case AnswerState.Wrong:
                    faceColor = Theme.Danger;
                    textColor = Color.white;
                    letterColor = Color.white;
                    badge = new Color(0f, 0f, 0f, 0.15f);
                    break;
                default:
                    faceColor = hovered && interactable ? Theme.SurfaceHover : Theme.SurfaceRaised;
                    break;
            }
            Tween.ColorTo(face, faceColor, Theme.Fast);
            outline.color = outlineColor;
            text.color = textColor;
            letter.color = letterColor;
            letterBadge.color = badge;
        }

        /// <summary>Hidden → visible pop-in with a small stagger.</summary>
        public void AnimateIn(float delay)
        {
            group.alpha = 0f;
            rt.anchoredPosition = home + new Vector2(0f, -30f);
            Tween.Fade(group, state == AnswerState.Removed ? 0.18f : 1f, 0.25f, Ease.OutCubic, delay);
            Tween.Move(rt, home, 0.35f, Ease.OutBack, delay);
        }

        public void Hide(bool animate)
        {
            if (animate) Tween.Fade(group, 0f, Theme.Fast);
            else group.alpha = 0f;
            glow.color = new Color(0f, 0f, 0f, 0f);
        }

        public void OnPointerEnter(PointerEventData e)
        {
            if (!interactable) return;
            hovered = true;
            RefreshFace();
            Tween.Scale(rt, 1.025f, Theme.Fast);
        }

        public void OnPointerExit(PointerEventData e)
        {
            if (!hovered) return;
            hovered = false;
            RefreshFace();
            Tween.Scale(rt, 1f, Theme.Fast);
        }

        public void OnPointerDown(PointerEventData e)
        {
            if (!interactable) return;
            Tween.Scale(rt, 0.97f, 0.06f, Ease.OutQuint);
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (!interactable) return;
            Tween.Scale(rt, hovered ? 1.025f : 1f, Theme.Normal, Ease.OutBack);
        }

        public void OnPointerClick(PointerEventData e)
        {
            if (e.button != PointerEventData.InputButton.Left) return;
            Press();
        }

        /// <summary>Same as a tap (keyboard 1–4).</summary>
        public void Press()
        {
            if (!interactable || state == AnswerState.Removed) return;
            Clicked?.Invoke(Index);
        }
    }
}
