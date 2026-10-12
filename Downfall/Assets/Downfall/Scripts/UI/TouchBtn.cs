using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // on-screen driving button: sets the GameInput touch field while held
    public sealed class TouchBtn : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        public Action<float> set;
        public Image bg, border;
        public Text text;
        bool down;
        public void OnPointerDown(PointerEventData e) { down = true; set?.Invoke(1); UI.Touching = true; Paint(); }
        public void OnPointerUp(PointerEventData e) { Release(); }
        public void OnPointerExit(PointerEventData e) { Release(); }
        void Release() { if (!down) return; down = false; set?.Invoke(0); Paint(); }
        void OnDisable() { if (down) { down = false; set?.Invoke(0); } Paint(); }
        public void Paint()
        {
            if (bg) bg.color = down ? Pal.C(235, 230, 218, .18f) : Pal.C(13, 14, 15, .35f);
            if (border) border.color = down ? Pal.ink : Pal.line2;
            if (text) text.color = down ? Pal.ink : Pal.ink2;
        }
    }
}
