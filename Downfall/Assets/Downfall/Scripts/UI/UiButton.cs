using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // Button whose look is painted by code (hover / keyboard focus / on / disabled)
    public class UiButton : Button
    {
        public Action<UiButton> paint;
        public Action onSubmitAlt;
        public bool on, hovered, pref;
        public string hoverSound;
        public Text label;
        public int st;
        public object data;
        public static bool kbFocus;
        public bool Selected => EventSystem.current != null && EventSystem.current.currentSelectedGameObject == gameObject;
        public bool Focus => kbFocus && Selected && IsInteractable();
        public bool Hot => (hovered || Focus) && IsInteractable();

        protected override void DoStateTransition(SelectionState state, bool instant)
        {
            st = (int)state;
            paint?.Invoke(this);
        }
        public override void OnPointerEnter(PointerEventData e)
        {
            base.OnPointerEnter(e);
            hovered = true;
            if (IsInteractable() && hoverSound != null && !UI.Touching) AudioSys.A?.Ui(hoverSound);
            paint?.Invoke(this);
        }
        public override void OnPointerExit(PointerEventData e) { base.OnPointerExit(e); hovered = false; paint?.Invoke(this); }
        public override void OnPointerDown(PointerEventData e) { kbFocus = false; base.OnPointerDown(e); }
        public override void OnSelect(BaseEventData e)
        {
            base.OnSelect(e);
            if (e is AxisEventData) { kbFocus = true; AudioSys.A?.Ui("hover"); }
            var sr = GetComponentInParent<ScrollRect>();
            if (sr != null && kbFocus) K.ScrollIntoView(sr, (RectTransform)transform);
            paint?.Invoke(this);
        }
        public override void OnDeselect(BaseEventData e) { base.OnDeselect(e); paint?.Invoke(this); }
        public override void OnSubmit(BaseEventData e)
        {
            kbFocus = true;
            if (onSubmitAlt != null && IsInteractable()) { onSubmitAlt(); return; }
            base.OnSubmit(e);
        }
        public void Repaint() => paint?.Invoke(this);
        protected override void OnDisable() { hovered = false; base.OnDisable(); }
    }
}
