using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // .mitem / .gtab: dash + label that slide on hover and focus
    public sealed class MitemFx : MonoBehaviour
    {
        public UiButton b;
        public RectTransform dash, lab;
        public Image dashImg;
        public Text text;
        public float x0 = 26, x1 = 34, w0 = 12, w1 = 22;
        public Color c0, c1, d0, d1;
        float k;
        void Update()
        {
            float target = b != null && (b.Hot || b.on) ? 1 : 0;
            k = Mathf.MoveTowards(k, target, Time.unscaledDeltaTime / 0.22f);
            float e = k * k * (3 - 2 * k);
            if (lab) lab.anchoredPosition = new Vector2(Mathf.Lerp(x0, x1, e), lab.anchoredPosition.y);
            if (dash) dash.sizeDelta = new Vector2(Mathf.Lerp(w0, w1, e), 1);
            if (dashImg) dashImg.color = Color.Lerp(d0, d1, e);
            if (text) text.color = Color.Lerp(c0, c1, e);
        }
    }
}
