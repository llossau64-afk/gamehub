using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // sizes a GridLayoutGroup's cells like css `repeat(auto-fill, minmax(min, 1fr))`
    public sealed class GridFit : MonoBehaviour
    {
        public GridLayoutGroup grid;
        public RectTransform viewport;
        public float min = 168, height = 150;
        float lastW = -1;
        void LateUpdate()
        {
            float w = viewport ? viewport.rect.width : ((RectTransform)transform).rect.width;
            if (Mathf.Abs(w - lastW) < 0.5f || w <= 0) return;
            lastW = w;
            float gap = grid.spacing.x;
            int cols = Mathf.Max(1, Mathf.FloorToInt((w + gap) / (min + gap)));
            grid.cellSize = new Vector2((w - gap * (cols - 1)) / cols, height);
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = cols;
        }
    }
}
