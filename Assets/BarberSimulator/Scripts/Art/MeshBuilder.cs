using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace BarberSimulator.Art
{
    /// <summary>
    /// Procedural mesh construction used to author the placeholder environment and characters: bevelled boxes,
    /// lathed (turned) shapes, ellipsoids, tori and quads, merged into one mesh with one submesh per material slot.
    /// Triangle winding is derived from the intended normal, so callers never need to think about it.
    /// UVs are in metres divided by <c>uvScale</c> (metres per texture repeat).
    /// </summary>
    public sealed class MeshBuilder
    {
        private readonly List<Vector3> _vertices = new List<Vector3>(1024);
        private readonly List<Vector3> _normals = new List<Vector3>(1024);
        private readonly List<Vector2> _uvs = new List<Vector2>(1024);
        private readonly List<List<int>> _submeshes = new List<List<int>>();

        /// <summary>Applied to everything added afterwards (position/rotation/scale of the part).</summary>
        public Matrix4x4 Transform { get; set; } = Matrix4x4.identity;

        public int VertexCount => _vertices.Count;

        private List<int> Submesh(int index)
        {
            while (_submeshes.Count <= index) _submeshes.Add(new List<int>());
            return _submeshes[index];
        }

        private int AddVertex(Vector3 position, Vector3 normal, Vector2 uv)
        {
            _vertices.Add(Transform.MultiplyPoint3x4(position));
            _normals.Add(Transform.MultiplyVector(normal).normalized);
            _uvs.Add(uv);
            return _vertices.Count - 1;
        }

        /// <summary>Adds a triangle oriented so that it faces along <paramref name="outward"/> (in local space).</summary>
        private void AddTriangle(int submesh, int a, int b, int c, Vector3 outwardWorld)
        {
            var pa = _vertices[a];
            var cross = Vector3.Cross(_vertices[b] - pa, _vertices[c] - pa);
            var list = Submesh(submesh);
            if (Vector3.Dot(cross, outwardWorld) >= 0f)
            {
                list.Add(a); list.Add(b); list.Add(c);
            }
            else
            {
                list.Add(a); list.Add(c); list.Add(b);
            }
        }

        private void AddQuadIndices(int submesh, int a, int b, int c, int d)
        {
            // a-b-c-d around the quad; outward = averaged vertex normal.
            var outward = _normals[a] + _normals[b] + _normals[c] + _normals[d];
            AddTriangle(submesh, a, b, c, outward);
            AddTriangle(submesh, a, c, d, outward);
        }

        // ------------------------------------------------------------------ Box

        /// <summary>Box with rounded edges. <paramref name="bevel"/> = 0 gives a sharp box.</summary>
        public void Box(Vector3 center, Vector3 size, int submesh, float bevel = 0.01f, float uvScale = 1f, Quaternion? rotation = null, int bevelSegments = 2)
        {
            var rot = rotation ?? Quaternion.identity;
            var half = size * 0.5f;
            bevel = Mathf.Clamp(bevel, 0f, Mathf.Min(half.x, Mathf.Min(half.y, half.z)) * 0.95f);
            int seg = bevel > 0.0005f ? Mathf.Max(1, bevelSegments) : 0;
            var inner = half - Vector3.one * bevel;

            AddBoxFace(center, rot, half, inner, bevel, seg, Vector3.right, Vector3.forward, Vector3.up, submesh, uvScale);
            AddBoxFace(center, rot, half, inner, bevel, seg, Vector3.left, Vector3.back, Vector3.up, submesh, uvScale);
            AddBoxFace(center, rot, half, inner, bevel, seg, Vector3.up, Vector3.right, Vector3.forward, submesh, uvScale);
            AddBoxFace(center, rot, half, inner, bevel, seg, Vector3.down, Vector3.right, Vector3.back, submesh, uvScale);
            AddBoxFace(center, rot, half, inner, bevel, seg, Vector3.forward, Vector3.left, Vector3.up, submesh, uvScale);
            AddBoxFace(center, rot, half, inner, bevel, seg, Vector3.back, Vector3.right, Vector3.up, submesh, uvScale);
        }

        private static List<float> AxisSamples(float h, float r, int seg)
        {
            var list = new List<float>();
            if (seg == 0)
            {
                list.Add(-h);
                list.Add(h);
                return list;
            }
            float inner = h - r;
            for (int k = seg; k >= 0; k--) list.Add(-inner - r * Mathf.Tan(Mathf.PI * 0.25f * k / seg));
            for (int k = 0; k <= seg; k++) list.Add(inner + r * Mathf.Tan(Mathf.PI * 0.25f * k / seg));
            return list;
        }

        private static float Component(Vector3 v, Vector3 axis) => Vector3.Dot(v, new Vector3(Mathf.Abs(axis.x), Mathf.Abs(axis.y), Mathf.Abs(axis.z)));

        private void AddBoxFace(Vector3 center, Quaternion rot, Vector3 half, Vector3 inner, float r, int seg,
            Vector3 n, Vector3 u, Vector3 v, int submesh, float uvScale)
        {
            float hu = Component(half, u), hv = Component(half, v), hn = Component(half, n);
            var su = AxisSamples(hu, r, seg);
            var sv = AxisSamples(hv, r, seg);
            int start = _vertices.Count;

            for (int j = 0; j < sv.Count; j++)
            {
                for (int i = 0; i < su.Count; i++)
                {
                    var p = n * hn + u * su[i] + v * sv[j];
                    var clamped = new Vector3(Mathf.Clamp(p.x, -inner.x, inner.x), Mathf.Clamp(p.y, -inner.y, inner.y), Mathf.Clamp(p.z, -inner.z, inner.z));
                    var delta = p - clamped;
                    Vector3 normal, pos;
                    if (r <= 0.0005f || delta.sqrMagnitude < 1e-10f)
                    {
                        normal = n;
                        pos = p;
                    }
                    else
                    {
                        normal = delta.normalized;
                        pos = clamped + normal * r;
                    }
                    var uv = new Vector2(Vector3.Dot(pos, u), Vector3.Dot(pos, v)) / Mathf.Max(0.0001f, uvScale);
                    AddVertex(center + rot * pos, rot * normal, uv);
                }
            }

            int w = su.Count;
            for (int j = 0; j < sv.Count - 1; j++)
            {
                for (int i = 0; i < w - 1; i++)
                {
                    int a = start + j * w + i;
                    AddQuadIndices(submesh, a, a + 1, a + 1 + w, a + w);
                }
            }
        }

        // ------------------------------------------------------------------ Lathe

        /// <summary>
        /// Surface of revolution around local Y. <paramref name="profile"/> lists (radius, height) from bottom to top.
        /// Repeat a point to create a hard crease. Caps close the shape where the radius is non-zero.
        /// </summary>
        public void Lathe(Vector3 center, IList<Vector2> profile, int segments, int submesh, bool capBottom = false, bool capTop = false,
            float uvScale = 1f, Quaternion? rotation = null, float arcDegrees = 360f)
        {
            var rot = rotation ?? Quaternion.identity;
            int count = profile.Count;
            if (count < 2) return;

            // Per-point 2D normals from adjacent non-degenerate segments.
            var normals2D = new Vector2[count];
            for (int i = 0; i < count; i++)
            {
                Vector2 sum = Vector2.zero;
                if (i > 0) sum += SegmentNormal(profile[i - 1], profile[i]);
                if (i < count - 1) sum += SegmentNormal(profile[i], profile[i + 1]);
                // Duplicate points (creases) take the normal from their own side only.
                if (i > 0 && (profile[i] - profile[i - 1]).sqrMagnitude < 1e-10f && i < count - 1) sum = SegmentNormal(profile[i], profile[i + 1]);
                if (i < count - 1 && (profile[i + 1] - profile[i]).sqrMagnitude < 1e-10f && i > 0) sum = SegmentNormal(profile[i - 1], profile[i]);
                normals2D[i] = sum.sqrMagnitude > 1e-10f ? sum.normalized : Vector2.right;
            }

            float[] lengths = new float[count];
            for (int i = 1; i < count; i++) lengths[i] = lengths[i - 1] + Vector2.Distance(profile[i], profile[i - 1]);

            bool closed = Mathf.Approximately(arcDegrees, 360f);
            int ringCount = segments + 1;
            int start = _vertices.Count;
            float maxRadius = 0f;
            foreach (var p in profile) maxRadius = Mathf.Max(maxRadius, p.x);
            float circumference = Mathf.Max(0.001f, 2f * Mathf.PI * maxRadius * arcDegrees / 360f);

            for (int i = 0; i < count; i++)
            {
                for (int s = 0; s < ringCount; s++)
                {
                    float t = (float)s / segments;
                    float angle = t * arcDegrees * Mathf.Deg2Rad;
                    float cos = Mathf.Cos(angle), sin = Mathf.Sin(angle);
                    var pos = new Vector3(profile[i].x * cos, profile[i].y, profile[i].x * sin);
                    var nrm = new Vector3(normals2D[i].x * cos, normals2D[i].y, normals2D[i].x * sin);
                    var uv = new Vector2(t * circumference, lengths[i]) / Mathf.Max(0.0001f, uvScale);
                    AddVertex(center + rot * pos, rot * nrm, uv);
                }
            }

            for (int i = 0; i < count - 1; i++)
            {
                if ((profile[i + 1] - profile[i]).sqrMagnitude < 1e-10f) continue;
                for (int s = 0; s < segments; s++)
                {
                    int a = start + i * ringCount + s;
                    int b = a + 1;
                    int c = a + 1 + ringCount;
                    int d = a + ringCount;
                    AddQuadIndices(submesh, a, b, c, d);
                }
            }

            if (closed && capBottom && profile[0].x > 0.0001f) Cap(center, rot, profile[0], segments, submesh, Vector3.down, uvScale);
            if (closed && capTop && profile[count - 1].x > 0.0001f) Cap(center, rot, profile[count - 1], segments, submesh, Vector3.up, uvScale);
        }

        private static Vector2 SegmentNormal(Vector2 a, Vector2 b)
        {
            var d = b - a;
            if (d.sqrMagnitude < 1e-10f) return Vector2.zero;
            return new Vector2(d.y, -d.x).normalized;
        }

        private void Cap(Vector3 center, Quaternion rot, Vector2 ringPoint, int segments, int submesh, Vector3 normal, float uvScale)
        {
            int centerIndex = AddVertex(center + rot * new Vector3(0f, ringPoint.y, 0f), rot * normal, new Vector2(0.5f, 0.5f));
            int first = _vertices.Count;
            for (int s = 0; s <= segments; s++)
            {
                float angle = (float)s / segments * Mathf.PI * 2f;
                var pos = new Vector3(ringPoint.x * Mathf.Cos(angle), ringPoint.y, ringPoint.x * Mathf.Sin(angle));
                var uv = new Vector2(pos.x, pos.z) / Mathf.Max(0.0001f, uvScale) + new Vector2(0.5f, 0.5f);
                AddVertex(center + rot * pos, rot * normal, uv);
            }
            var outward = Transform.MultiplyVector(rot * normal);
            for (int s = 0; s < segments; s++) AddTriangle(submesh, centerIndex, first + s, first + s + 1, outward);
        }

        public void Cylinder(Vector3 center, float radius, float height, int segments, int submesh, float uvScale = 1f, Quaternion? rotation = null, bool caps = true)
        {
            var profile = new[]
            {
                new Vector2(radius, -height * 0.5f),
                new Vector2(radius, height * 0.5f)
            };
            Lathe(center, profile, segments, submesh, caps, caps, uvScale, rotation);
        }

        /// <summary>Tapered cylinder (cone frustum), useful for legs, lamp shades and bottles.</summary>
        public void Frustum(Vector3 center, float bottomRadius, float topRadius, float height, int segments, int submesh, float uvScale = 1f, Quaternion? rotation = null, bool caps = true)
        {
            var profile = new[]
            {
                new Vector2(bottomRadius, -height * 0.5f),
                new Vector2(topRadius, height * 0.5f)
            };
            Lathe(center, profile, segments, submesh, caps, caps, uvScale, rotation);
        }

        public void Ellipsoid(Vector3 center, Vector3 radii, int segments, int rings, int submesh, float uvScale = 1f, Quaternion? rotation = null)
        {
            var rot = rotation ?? Quaternion.identity;
            int ringCount = segments + 1;
            int start = _vertices.Count;
            var inverseSquared = new Vector3(1f / (radii.x * radii.x), 1f / (radii.y * radii.y), 1f / (radii.z * radii.z));

            for (int i = 0; i <= rings; i++)
            {
                float lat = -Mathf.PI * 0.5f + Mathf.PI * i / rings;
                for (int s = 0; s < ringCount; s++)
                {
                    float lon = 2f * Mathf.PI * s / segments;
                    var unit = new Vector3(Mathf.Cos(lat) * Mathf.Cos(lon), Mathf.Sin(lat), Mathf.Cos(lat) * Mathf.Sin(lon));
                    var pos = Vector3.Scale(unit, radii);
                    var normal = Vector3.Scale(pos, inverseSquared).normalized;
                    if (normal.sqrMagnitude < 1e-8f) normal = unit;
                    var uv = new Vector2((float)s / segments, (float)i / rings) * (Mathf.PI * Mathf.Max(radii.x, radii.z) * 2f / Mathf.Max(0.0001f, uvScale));
                    AddVertex(center + rot * pos, rot * normal, uv);
                }
            }

            for (int i = 0; i < rings; i++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int a = start + i * ringCount + s;
                    AddQuadIndices(submesh, a, a + 1, a + 1 + ringCount, a + ringCount);
                }
            }
        }

        public void Torus(Vector3 center, float majorRadius, float minorRadius, int segments, int sides, int submesh, Quaternion? rotation = null, float uvScale = 1f)
        {
            var profile = new Vector2[sides + 1];
            for (int i = 0; i <= sides; i++)
            {
                float a = -Mathf.PI + 2f * Mathf.PI * i / sides;
                // Walk the tube circle counter-clockwise so lathe normals point outwards.
                profile[i] = new Vector2(majorRadius + Mathf.Cos(a) * minorRadius, Mathf.Sin(a) * minorRadius);
            }
            Lathe(center, profile, segments, submesh, false, false, uvScale, rotation);
        }

        /// <summary>Single-sided quad in the local XY plane, visible from +Z (its normal is +Z).</summary>
        public void Quad(Vector3 center, Vector2 size, int submesh, Quaternion? rotation = null, Rect? uvRect = null, bool doubleSided = false)
        {
            var rot = rotation ?? Quaternion.identity;
            var uvs = uvRect ?? new Rect(0f, 0f, 1f, 1f);
            var hx = size.x * 0.5f;
            var hy = size.y * 0.5f;
            var normal = rot * Vector3.forward;
            // Seen from +Z, +X is to the viewer's left; mirror U so textures read correctly.
            int a = AddVertex(center + rot * new Vector3(hx, -hy, 0f), normal, new Vector2(uvs.xMin, uvs.yMin));
            int b = AddVertex(center + rot * new Vector3(-hx, -hy, 0f), normal, new Vector2(uvs.xMax, uvs.yMin));
            int c = AddVertex(center + rot * new Vector3(-hx, hy, 0f), normal, new Vector2(uvs.xMax, uvs.yMax));
            int d = AddVertex(center + rot * new Vector3(hx, hy, 0f), normal, new Vector2(uvs.xMin, uvs.yMax));
            AddQuadIndices(submesh, a, b, c, d);
            if (doubleSided) Quad(center, size, submesh, rot * Quaternion.Euler(0f, 180f, 0f), new Rect(uvs.xMax, uvs.yMin, -uvs.width, uvs.height));
        }

        /// <summary>Appends an existing mesh (all submeshes into <paramref name="submesh"/>).</summary>
        public void Append(Mesh mesh, Matrix4x4 matrix, int submesh)
        {
            var verts = mesh.vertices;
            var norms = mesh.normals;
            var uv = mesh.uv;
            int start = _vertices.Count;
            var previous = Transform;
            Transform = previous * matrix;
            for (int i = 0; i < verts.Length; i++)
                AddVertex(verts[i], norms.Length > i ? norms[i] : Vector3.up, uv.Length > i ? uv[i] : Vector2.zero);
            Transform = previous;
            var tris = mesh.triangles;
            var list = Submesh(submesh);
            for (int i = 0; i < tris.Length; i++) list.Add(start + tris[i]);
        }

        public Mesh Build(string name, int submeshCount = -1)
        {
            var mesh = new Mesh { name = name };
            if (_vertices.Count > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(_vertices);
            mesh.SetNormals(_normals);
            mesh.SetUVs(0, _uvs);
            int count = submeshCount > 0 ? submeshCount : _submeshes.Count;
            mesh.subMeshCount = Mathf.Max(1, count);
            for (int i = 0; i < mesh.subMeshCount; i++)
                mesh.SetTriangles(i < _submeshes.Count ? _submeshes[i] : new List<int>(), i, true);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }

        public void Clear()
        {
            _vertices.Clear();
            _normals.Clear();
            _uvs.Clear();
            _submeshes.Clear();
            Transform = Matrix4x4.identity;
        }
    }
}
