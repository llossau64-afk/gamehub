using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Tracking (letter spacing) for legacy uGUI Text. Works per glyph quad and per line, so it is independent of
    /// whether Unity emits geometry for whitespace.
    /// </summary>
    [RequireComponent(typeof(Text))]
    public sealed class LetterSpacing : BaseMeshEffect
    {
        [SerializeField] private float spacing = 4f;

        private readonly List<UIVertex> _verts = new List<UIVertex>(256);

        public float Spacing
        {
            get => spacing;
            set
            {
                spacing = value;
                if (graphic != null) graphic.SetVerticesDirty();
            }
        }

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || Mathf.Approximately(spacing, 0f)) return;

            var text = GetComponent<Text>();
            _verts.Clear();
            vh.GetUIVertexStream(_verts);
            int quadCount = _verts.Count / 6;
            if (quadCount == 0) return;

            float lineThreshold = text.fontSize * 0.5f;
            int lineStart = 0;
            float lineY = _verts[0].position.y;
            float alignFactor = AlignmentFactor(text.alignment);

            for (int q = 0; q <= quadCount; q++)
            {
                bool newLine = q == quadCount || Mathf.Abs(MinY(q) - lineY) > lineThreshold && q > lineStart;
                if (!newLine) continue;

                int glyphs = q - lineStart;
                float lineShift = -(glyphs - 1) * spacing * alignFactor;
                for (int g = 0; g < glyphs; g++)
                {
                    float offset = g * spacing + lineShift;
                    int baseIndex = (lineStart + g) * 6;
                    for (int v = 0; v < 6; v++)
                    {
                        var vert = _verts[baseIndex + v];
                        vert.position.x += offset;
                        _verts[baseIndex + v] = vert;
                    }
                }

                if (q < quadCount)
                {
                    lineStart = q;
                    lineY = MinY(q);
                }
            }

            vh.Clear();
            vh.AddUIVertexTriangleStream(_verts);
        }

        private float MinY(int quad)
        {
            int i = quad * 6;
            float y = _verts[i].position.y;
            for (int v = 1; v < 6; v++) y = Mathf.Min(y, _verts[i + v].position.y);
            return y;
        }

        private static float AlignmentFactor(TextAnchor anchor)
        {
            switch (anchor)
            {
                case TextAnchor.UpperCenter:
                case TextAnchor.MiddleCenter:
                case TextAnchor.LowerCenter:
                    return 0.5f;
                case TextAnchor.UpperRight:
                case TextAnchor.MiddleRight:
                case TextAnchor.LowerRight:
                    return 1f;
                default:
                    return 0f;
            }
        }
    }
}
