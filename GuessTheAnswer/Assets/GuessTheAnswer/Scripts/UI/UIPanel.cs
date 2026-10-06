using GuessTheAnswer.Audio;
using GuessTheAnswer.Core;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>
    /// A modal card over the current screen (settings, profile, confirmations). The scrim blocks the screen below;
    /// tapping it or pressing ESC closes the panel when <see cref="Dismissable"/> is set.
    /// </summary>
    public abstract class UIPanel : MonoBehaviour
    {
        protected UIManager UI { get; private set; }
        protected static App App => App.Instance;
        protected RectTransform Card { get; private set; }
        protected CanvasGroup Group { get; private set; }
        public virtual bool Dismissable => true;
        protected virtual Vector2 CardSize => new Vector2(980f, 760f);

        public void Build(UIManager ui)
        {
            UI = ui;
            var rt = (RectTransform)transform;
            UIFactory.Stretch(rt);
            Group = UIFactory.Group(this);

            var scrim = UIFactory.Image(rt, "Scrim", Theme.Scrim, Shapes.White, raycast: true);
            UIFactory.Stretch(scrim.rectTransform, -200f, -200f, -200f, -200f);
            var scrimButton = scrim.gameObject.AddComponent<ScrimClick>();
            scrimButton.Panel = this;

            var card = UIFactory.Panel(rt, "Card", Theme.BackgroundTop, Theme.RadiusLarge, raycast: true);
            Card = card.rectTransform;
            UIFactory.Place(Card, new Vector2(0.5f, 0.5f), Vector2.zero, CardSize);
            UIFactory.Shadow(Card, 30f, -14f, 0.6f);
            UIFactory.Outline(Card, new Color(1f, 1f, 1f, 0.06f), Theme.RadiusLarge);
            OnBuild();
        }

        protected abstract void OnBuild();

        public virtual void OnOpen(object argument) { }
        public virtual void OnClose() { }
        public virtual void OnKey(KeyCode key) { }
        public virtual void OnText(char c) { }

        public void Close()
        {
            UI.ClosePanel(this);
        }

        public void TryDismiss()
        {
            if (Dismissable) Close();
        }

        /// <summary>Panel title with an optional close button in the top-right corner.</summary>
        protected Text Title(string text, bool closeButton = true)
        {
            var title = UIFactory.Label(Card, text, Theme.H2, Theme.Text, Theme.Bold);
            UIFactory.Place(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -60f), new Vector2(CardSize.x - 220f, 80f));
            if (closeButton)
            {
                var close = GameButton.IconButton(Card, "close", 72f, ButtonStyle.Ghost);
                UIFactory.Place((RectTransform)close.transform, new Vector2(1f, 1f), new Vector2(-28f, -24f), new Vector2(72f, 72f), new Vector2(1f, 1f));
                close.OnClick = Close;
            }
            return title;
        }

        sealed class ScrimClick : MonoBehaviour, UnityEngine.EventSystems.IPointerClickHandler
        {
            public UIPanel Panel;

            public void OnPointerClick(UnityEngine.EventSystems.PointerEventData e)
            {
                if (Panel != null && Panel.Dismissable)
                {
                    UIFeedback.Play(Sfx.Click);
                    Panel.Close();
                }
            }
        }
    }
}
