using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // a scroll area that grows with its content up to a maximum height (css max-height + overflow:auto)
    public sealed class FitScroll : MonoBehaviour
    {
        public LayoutElement le;
        public RectTransform content;
        public Func<float> max;
        void LateUpdate()
        {
            if (!le || !content) return;
            float h = LayoutUtility.GetPreferredHeight(content);
            float m = max != null ? max() : 800;
            float v = Mathf.Min(h, m);
            if (Mathf.Abs(le.preferredHeight - v) > 0.5f) le.preferredHeight = v;
        }
    }
}
