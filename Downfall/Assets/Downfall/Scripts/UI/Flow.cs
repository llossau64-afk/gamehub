using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // flex-wrap row: children left to right, wrapping to new lines (css .traits / .effects / .tires)
    public sealed class Flow : LayoutGroup
    {
        public float gapX = 6, gapY = 6;
        float Pref(RectTransform c, int axis) => LayoutUtility.GetPreferredSize(c, axis);
        public override void CalculateLayoutInputHorizontal()
        {
            base.CalculateLayoutInputHorizontal();
            float w = padding.horizontal;
            foreach (var c in rectChildren) w += Pref(c, 0) + gapX;
            SetLayoutInputForAxis(padding.horizontal, w, 1, 0);
        }
        public override void CalculateLayoutInputVertical()
        {
            float h = Place(false);
            SetLayoutInputForAxis(h, h, -1, 1);
        }
        public override void SetLayoutHorizontal() { }
        public override void SetLayoutVertical() { Place(true); }
        float Place(bool apply)
        {
            float W = rectTransform.rect.width - padding.horizontal;
            float x = 0, y = padding.top, lineH = 0;
            foreach (var c in rectChildren)
            {
                float cw = Mathf.Min(Pref(c, 0), Mathf.Max(1, W)), ch = Pref(c, 1);
                if (x > 0 && x + cw > W) { x = 0; y += lineH + gapY; lineH = 0; }
                if (apply) { SetChildAlongAxis(c, 0, padding.left + x, cw); SetChildAlongAxis(c, 1, y, ch); }
                x += cw + gapX; lineH = Mathf.Max(lineH, ch);
            }
            return y + lineH + padding.bottom;
        }
    }
}
