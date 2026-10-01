using System.Collections;
using UnityEngine;

namespace BarberSimulator.UI
{
    /// <summary>Base for full views: owns a CanvasGroup and handles show/hide transitions.</summary>
    public abstract class UIView : MonoBehaviour
    {
        protected UIFactory Factory { get; private set; }
        protected CanvasGroup Group { get; private set; }
        protected RectTransform Root { get; private set; }

        private Coroutine _transition;

        public bool IsVisible { get; private set; }

        public void Build(UIFactory factory)
        {
            Factory = factory;
            Root = (RectTransform)transform;
            Group = gameObject.GetComponent<CanvasGroup>();
            if (Group == null) Group = gameObject.AddComponent<CanvasGroup>();
            OnBuild();
            UIAnimation.SetVisible(Group, false);
            gameObject.SetActive(false);
        }

        protected abstract void OnBuild();

        public void Show(bool instant = false)
        {
            IsVisible = true;
            gameObject.SetActive(true);
            Group.interactable = true;
            Group.blocksRaycasts = true;
            Restart(instant ? null : ShowRoutine());
            if (instant) Group.alpha = 1f;
            OnShown();
        }

        public void Hide(bool instant = false)
        {
            if (!gameObject.activeSelf) return;
            IsVisible = false;
            Group.interactable = false;
            Group.blocksRaycasts = false;
            if (instant)
            {
                Restart(null);
                Group.alpha = 0f;
                gameObject.SetActive(false);
                return;
            }
            Restart(HideRoutine());
        }

        protected virtual void OnShown() { }

        protected virtual IEnumerator ShowRoutine()
        {
            yield return UIAnimation.Fade(Group, 1f, Factory.Theme.panelFadeDuration);
        }

        protected virtual IEnumerator HideRoutine()
        {
            yield return UIAnimation.Fade(Group, 0f, Factory.Theme.panelFadeDuration * 0.8f);
            gameObject.SetActive(false);
        }

        private void Restart(IEnumerator routine)
        {
            if (_transition != null) StopCoroutine(_transition);
            _transition = routine != null && gameObject.activeInHierarchy ? StartCoroutine(routine) : null;
        }
    }
}
