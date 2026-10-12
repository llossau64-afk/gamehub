using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
    // css letter-spacing for legacy Text (offsets glyph quads per line)
    [DisallowMultipleComponent]
    public sealed class Tracking : BaseMeshEffect, ILayoutElement
    {
        public float em;
        Text txt;
        static readonly List<UIVertex> vs = new List<UIVertex>();
        Text T => txt ? txt : (txt = GetComponent<Text>());

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || em == 0 || T == null) return;
            float sp = em * T.fontSize;
            vs.Clear();
            vh.GetUIVertexStream(vs);
            int quads = vs.Count / 6;
            if (quads < 2) return;
            int align = (int)T.alignment % 3;
            int lineStart = 0, k = 0;
            float prevX = 0, lineTop = 0;
            var idx = new int[quads];
            for (int q = 0; q < quads; q++)
            {
                float x = Mathf.Min(vs[q * 6].position.x, vs[q * 6 + 4].position.x), y = Mathf.Max(vs[q * 6].position.y, vs[q * 6 + 1].position.y);
                if (q > lineStart && (x < prevX - 0.5f || y < lineTop - T.fontSize * 0.6f)) { ShiftLine(lineStart, q, k, sp, align, idx); lineStart = q; k = 0; }
                if (q == lineStart) lineTop = y;
                idx[q] = k++; prevX = x;
            }
            ShiftLine(lineStart, quads, k, sp, align, idx);
            vh.Clear();
            vh.AddUIVertexTriangleStream(vs);
        }
        static void ShiftLine(int a, int b, int n, float sp, int align, int[] idx)
        {
            float total = (n - 1) * sp;
            float shift = align == 1 ? -total / 2 : align == 2 ? -total : 0;
            for (int q = a; q < b; q++)
            {
                float dx = idx[q] * sp + shift;
                for (int j = 0; j < 6; j++) { var v = vs[q * 6 + j]; v.position.x += dx; vs[q * 6 + j] = v; }
            }
        }
        int LongestLine()
        {
            string s = K.Plain(T.text);
            int best = 0, cur = 0;
            foreach (char c in s) { if (c == '\n') { best = Mathf.Max(best, cur); cur = 0; } else if (c != ' ') cur++; }
            return Mathf.Max(best, cur);
        }
        public void CalculateLayoutInputHorizontal() { }
        public void CalculateLayoutInputVertical() { }
        public float minWidth => -1;
        public float preferredWidth => T == null || em == 0 ? -1 : T.preferredWidth + em * T.fontSize * Mathf.Max(0, LongestLine() - 1) + em * T.fontSize * 0.5f;
        public float flexibleWidth => -1;
        public float minHeight => -1;
        public float preferredHeight => -1;
        public float flexibleHeight => -1;
        public int layoutPriority => 2;
    }
}
