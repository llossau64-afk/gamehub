using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // keyboard-focusable slider with the amber focus ring
    public sealed class UiSlider : Slider
    {
        public Action<UiSlider> paint;
        protected override void DoStateTransition(SelectionState state, bool instant) { paint?.Invoke(this); }
        public override void OnSelect(BaseEventData e) { base.OnSelect(e); if (e is AxisEventData) { UiButton.kbFocus = true; AudioSys.A?.Ui("hover"); } paint?.Invoke(this); }
        public override void OnDeselect(BaseEventData e) { base.OnDeselect(e); paint?.Invoke(this); }
        public bool Focus => UiButton.kbFocus && EventSystem.current != null && EventSystem.current.currentSelectedGameObject == gameObject;
    }
}
