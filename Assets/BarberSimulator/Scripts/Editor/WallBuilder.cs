using System.Collections.Generic;
using BarberSimulator.Art;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Builds an interior wall (with openings) out of layered finishes: structure, wainscot, chair rail,
    /// wallpaper/plaster, baseboard, crown moulding and optional exterior brick skin. Each wall becomes one
    /// mesh with a submesh per finish plus simple box colliders for the solid parts.
    /// </summary>
    public sealed class WallBuilder
    {
        public struct Opening
        {
            public float Start;   // distance along the wall
            public float Width;
            public float Bottom;
            public float Top;

            public Opening(float start, float width, float bottom, float top)
            {
                Start = start;
                Width = width;
                Bottom = bottom;
                Top = top;
            }
        }

        public struct Layer
        {
            public Material Material;
            public float Front;      // offset into the room from the wall face (>0 = into room)
            public float Back;       // offset behind the face (<= Front)
            public float YMin;
            public float YMax;
            public float Bevel;
            public float UvScale;
        }

        private readonly List<Layer> _layers = new List<Layer>();

        public WallBuilder AddLayer(Material material, float back, float front, float yMin, float yMax, float bevel = 0f, float uvScale = 1f)
        {
            _layers.Add(new Layer { Material = material, Back = back, Front = front, YMin = yMin, YMax = yMax, Bevel = bevel, UvScale = uvScale });
            return this;
        }

        /// <summary>
        /// Builds the wall. <paramref name="origin"/> is where the wall starts at floor level on its room-facing
        /// face, <paramref name="along"/> the direction it runs and <paramref name="intoRoom"/> its face normal.
        /// </summary>
        public GameObject Build(Transform parent, string name, Vector3 origin, Vector3 along, Vector3 intoRoom, float length, float height,
            IList<Opening> openings, bool colliders, float colliderThickness = 0.2f)
        {
            along.Normalize();
            intoRoom.Normalize();
            var rotation = Quaternion.LookRotation(intoRoom, Vector3.up); // local +Z = into room, local +X = ?
            // Make local +X follow "along" regardless of handedness.
            var right = rotation * Vector3.right;
            bool flip = Vector3.Dot(right, along) < 0f;

            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.SetPositionAndRotation(origin, rotation);

            var rects = SolidRects(length, height, openings);
            var builder = new MeshBuilder();
            var materials = new List<Material>();

            foreach (var layer in _layers)
            {
                int submesh = materials.IndexOf(layer.Material);
                if (submesh < 0)
                {
                    materials.Add(layer.Material);
                    submesh = materials.Count - 1;
                }

                foreach (var r in rects)
                {
                    float y0 = Mathf.Max(r.yMin, layer.YMin);
                    float y1 = Mathf.Min(r.yMax, layer.YMax);
                    if (y1 - y0 < 0.002f) continue;
                    float x0 = flip ? -r.xMax : r.xMin;
                    float x1 = flip ? -r.xMin : r.xMax;
                    float depth = layer.Front - layer.Back;
                    var center = new Vector3((x0 + x1) * 0.5f, (y0 + y1) * 0.5f, (layer.Front + layer.Back) * 0.5f);
                    builder.Box(center, new Vector3(x1 - x0, y1 - y0, depth), submesh, Mathf.Min(layer.Bevel, depth * 0.45f), layer.UvScale);
                }
            }

            var mesh = AssetUtility.SaveMesh(builder.Build(name, materials.Count), "Wall_" + name);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterials = materials.ToArray();

            if (colliders)
            {
                foreach (var r in rects)
                {
                    var box = go.AddComponent<BoxCollider>();
                    float x0 = flip ? -r.xMax : r.xMin;
                    float x1 = flip ? -r.xMin : r.xMax;
                    box.center = new Vector3((x0 + x1) * 0.5f, (r.yMin + r.yMax) * 0.5f, -colliderThickness * 0.5f + 0.03f);
                    box.size = new Vector3(x1 - x0, r.yMax - r.yMin, colliderThickness);
                }
            }
            return go;
        }

        /// <summary>Splits the wall rectangle into solid rectangles around the openings.</summary>
        private static List<Rect> SolidRects(float length, float height, IList<Opening> openings)
        {
            var edges = new List<float> { 0f, length };
            if (openings != null)
            {
                foreach (var o in openings)
                {
                    edges.Add(Mathf.Clamp(o.Start, 0f, length));
                    edges.Add(Mathf.Clamp(o.Start + o.Width, 0f, length));
                }
            }
            edges.Sort();

            var result = new List<Rect>();
            for (int i = 0; i < edges.Count - 1; i++)
            {
                float x0 = edges[i], x1 = edges[i + 1];
                if (x1 - x0 < 0.001f) continue;
                float mid = (x0 + x1) * 0.5f;

                var holes = new List<Vector2>();
                if (openings != null)
                    foreach (var o in openings)
                        if (mid > o.Start && mid < o.Start + o.Width) holes.Add(new Vector2(o.Bottom, o.Top));
                holes.Sort((a, b) => a.x.CompareTo(b.x));

                float y = 0f;
                foreach (var h in holes)
                {
                    if (h.x > y + 0.001f) result.Add(Rect.MinMaxRect(x0, y, x1, h.x));
                    y = Mathf.Max(y, h.y);
                }
                if (height > y + 0.001f) result.Add(Rect.MinMaxRect(x0, y, x1, height));
            }
            return result;
        }
    }
}
