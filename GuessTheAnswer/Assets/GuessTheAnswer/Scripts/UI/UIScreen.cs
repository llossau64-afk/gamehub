using GuessTheAnswer.Audio;
using GuessTheAnswer.Core;
using UnityEngine;

namespace GuessTheAnswer.UI
{
    /// <summary>
    /// A full-screen page (menu, lobby, game ...). Built once in code the first time it is shown, then reused.
    /// </summary>
    public abstract class UIScreen : MonoBehaviour
    {
        public RectTransform Root { get; private set; }
        public CanvasGroup Group { get; private set; }
        protected UIManager UI { get; private set; }
        protected static App App => App.Instance;
        public bool IsVisible { get; private set; }

        /// <summary>Music that plays while this screen is shown.</summary>
        public virtual MusicTrack Music => MusicTrack.Menu;

        /// <summary>Whether the animated menu background shows behind this screen.</summary>
        public virtual bool ShowBackground => true;

        public void Build(UIManager ui)
        {
            UI = ui;
            Root = (RectTransform)transform;
            Group = UIFactory.Group(this);
            OnBuild();
        }

        protected abstract void OnBuild();

        public void SetVisible(bool visible)
        {
            IsVisible = visible;
        }

        /// <summary>Called when the screen becomes the current one. The argument is optional data from the caller.</summary>
        public virtual void OnShow(object argument) { }

        public virtual void OnHide() { }

        /// <summary>ESC / back. Return true when handled.</summary>
        public virtual bool OnBack() => false;

        /// <summary>Keyboard shortcuts while this screen is on top.</summary>
        public virtual void OnKey(KeyCode key) { }

        /// <summary>Typed characters (desktop keyboards) while this screen is on top.</summary>
        public virtual void OnText(char c) { }
    }
}
