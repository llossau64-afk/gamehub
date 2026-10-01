using UnityEngine;

namespace BarberSimulator.Haircut
{
    /// <summary>
    /// WebGL-friendly hair visualisation. The scalp is covered by one shell mesh (a vertex per grid corner) whose
    /// height follows the hair length, plus a tiny dynamic colour texture (one pixel per cell) that blends from
    /// hair colour to scalp as hair gets shorter. A fade therefore reads as a real gradient, and every clipper pass
    /// is visible immediately. No strands, no physics: ~1.8k vertices and a 56×30 texture per head.
    /// </summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public sealed class HairShellRenderer : MonoBehaviour
    {
        private static readonly int BaseMapId = Shader.PropertyToID("_BaseMap");
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");

        [Tooltip("Scalp ellipsoid in this transform's local space.")]
        [SerializeField] private Vector3 center = new Vector3(0f, 0.11f, 0.005f);
        [SerializeField] private Vector3 radii = new Vector3(0.09f, 0.117f, 0.106f);
        [Tooltip("How far hair stands off the scalp per cm of length (metres).")]
        [SerializeField] private float volumePerCm = 0.0075f;
        [SerializeField] private float baseOffset = 0.0018f;

        private const int VertexColumns = HairGrid.Columns + 1;
        private const int VertexRows = HairGrid.Rows + 1;

        private Mesh _mesh;
        private Vector3[] _vertices;
        private Vector3[] _directions;
        private float[] _clump;
        private Texture2D _texture;
        private Color32[] _pixels;
        private Material _material;
        private int _renderedVersion = -1;
        private Color _hairColor = new Color(0.1f, 0.07f, 0.05f);
        private Color _scalpColor = new Color(0.78f, 0.6f, 0.48f);

        public HairGrid Grid { get; private set; }
        public Vector3 Center => center;
        public Vector3 Radii => radii;

        public void Configure(Vector3 scalpCenter, Vector3 scalpRadii)
        {
            center = scalpCenter;
            radii = scalpRadii;
        }

        private void Awake()
        {
            EnsureBuilt();
        }

        private void EnsureBuilt()
        {
            if (_mesh != null) return;

            _mesh = new Mesh { name = "HairShell" };
            _mesh.MarkDynamic();
            _vertices = new Vector3[VertexColumns * VertexRows];
            _directions = new Vector3[_vertices.Length];
            _clump = new float[_vertices.Length];
            var uvs = new Vector2[_vertices.Length];
            var rng = new System.Random(GetInstanceID());

            for (int r = 0; r < VertexRows; r++)
            for (int c = 0; c < VertexColumns; c++)
            {
                int i = r * VertexColumns + c;
                float lon = -180f + 360f * c / HairGrid.Columns;
                float lat = Mathf.Lerp(HairGrid.MinLatitude, HairGrid.MaxLatitude, (float)r / HairGrid.Rows);
                _directions[i] = HairGrid.Direction(lon, lat);
                uvs[i] = new Vector2((float)c / HairGrid.Columns, (float)r / HairGrid.Rows);
                // Clumping: neighbouring vertices share low-frequency variation so longer hair looks tufted, not moulded.
                _clump[i] = Mathf.PerlinNoise(c * 0.45f + 3.1f, r * 0.45f + 7.7f) * 2f - 1f + ((float)rng.NextDouble() - 0.5f) * 0.25f;
            }

            var triangles = new int[HairGrid.Columns * HairGrid.Rows * 6];
            int t = 0;
            for (int r = 0; r < HairGrid.Rows; r++)
            for (int c = 0; c < HairGrid.Columns; c++)
            {
                int a = r * VertexColumns + c;
                int b = a + 1;
                int d = a + VertexColumns;
                int e = d + 1;
                // Outward-facing winding (clockwise seen from outside, Unity convention).
                triangles[t++] = a; triangles[t++] = b; triangles[t++] = d;
                triangles[t++] = b; triangles[t++] = e; triangles[t++] = d;
            }

            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.triangles = triangles;
            GetComponent<MeshFilter>().sharedMesh = _mesh;

            _texture = new Texture2D(HairGrid.Columns, HairGrid.Rows, TextureFormat.RGBA32, false)
            {
                name = "HairLengthColour",
                wrapModeU = TextureWrapMode.Repeat,
                wrapModeV = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };
            _pixels = new Color32[HairGrid.Columns * HairGrid.Rows];

            var renderer = GetComponent<MeshRenderer>();
            if (renderer.sharedMaterial != null)
            {
                _material = new Material(renderer.sharedMaterial);
                _material.SetTexture(BaseMapId, _texture);
                _material.SetColor(BaseColorId, Color.white);
                renderer.sharedMaterial = _material;
            }
        }

        /// <summary>Binds a hair state and colours. Call again whenever the customer changes.</summary>
        public void Bind(HairGrid grid, Color hairColor, Color skinTone)
        {
            EnsureBuilt();
            Grid = grid;
            _hairColor = hairColor;
            // Shaved scalp: skin slightly darkened by stubble of the hair colour.
            _scalpColor = Color.Lerp(skinTone * 0.9f, hairColor, 0.18f);
            _scalpColor.a = 1f;
            _renderedVersion = -1;
            Refresh();
        }

        private void LateUpdate()
        {
            if (Grid != null && Grid.Version != _renderedVersion) Refresh();
        }

        public void Refresh()
        {
            if (Grid == null) return;
            _renderedVersion = Grid.Version;
            Grid.Dirty = false;

            // Colour texture: one pixel per cell.
            for (int r = 0; r < HairGrid.Rows; r++)
            for (int c = 0; c < HairGrid.Columns; c++)
            {
                var cell = Grid[c, r];
                Color color;
                if (!cell.Grows)
                {
                    color = _scalpColor;
                    color.a = 0f;
                }
                else
                {
                    float coverage = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(cell.Length / 0.7f));
                    color = Color.Lerp(_scalpColor, _hairColor, coverage);
                    // Longer hair catches a bit more light at the ends.
                    color = Color.Lerp(color, _hairColor * 1.35f, Mathf.Clamp01((cell.Length - 2f) / 4f) * 0.25f);
                    color.a = 1f;
                }
                _pixels[r * HairGrid.Columns + c] = color;
            }
            _texture.SetPixels32(_pixels);
            _texture.Apply(false, false);

            // Shell vertices: corner height = average of the surrounding growing cells.
            for (int r = 0; r < VertexRows; r++)
            for (int c = 0; c < VertexColumns; c++)
            {
                float sum = 0f, combed = 0f;
                int growing = 0;
                for (int dr = -1; dr <= 0; dr++)
                for (int dc = -1; dc <= 0; dc++)
                {
                    int rr = r + dr;
                    if (rr < 0 || rr >= HairGrid.Rows) continue;
                    var cell = Grid[c + dc, rr];
                    if (!cell.Grows) continue;
                    sum += cell.Length;
                    combed += cell.Combed;
                    growing++;
                }

                int i = r * VertexColumns + c;
                var dir = _directions[i];
                var scalp = center + Vector3.Scale(dir, radii);
                var normal = new Vector3(dir.x / radii.x, dir.y / radii.y, dir.z / radii.z).normalized;

                float offset;
                if (growing == 0)
                {
                    offset = -0.003f; // tucked under the skin, hidden by alpha clipping anyway
                }
                else
                {
                    float length = sum / growing;
                    float lift = 1f + combed / growing * 0.12f;
                    float clump = 1f + _clump[i] * Mathf.Clamp01(length / 3f) * 0.18f;
                    offset = baseOffset + length * volumePerCm * lift * clump;
                    if (growing < 4) offset *= 0.45f; // taper towards the hairline
                }
                _vertices[i] = scalp + normal * offset;
            }

            _mesh.vertices = _vertices;
            _mesh.RecalculateNormals();
            _mesh.RecalculateBounds();
        }

        // ------------------------------------------------------------------ queries

        /// <summary>Intersects a world ray with the hair surface. Returns the grid direction that was hit.</summary>
        public bool Raycast(Ray worldRay, out Vector3 worldPoint, out Vector3 gridDirection, out Vector3 worldNormal)
        {
            // Local space ray against an inflated ellipsoid (scalp + typical hair thickness).
            var inflated = radii + Vector3.one * 0.012f;
            var o = transform.InverseTransformPoint(worldRay.origin) - center;
            var d = transform.InverseTransformDirection(worldRay.direction);
            var os = new Vector3(o.x / inflated.x, o.y / inflated.y, o.z / inflated.z);
            var ds = new Vector3(d.x / inflated.x, d.y / inflated.y, d.z / inflated.z);

            float a = Vector3.Dot(ds, ds);
            float b = 2f * Vector3.Dot(os, ds);
            float k = Vector3.Dot(os, os) - 1f;
            float disc = b * b - 4f * a * k;
            worldPoint = gridDirection = worldNormal = Vector3.zero;
            if (disc < 0f) return false;

            float tHit = (-b - Mathf.Sqrt(disc)) / (2f * a);
            if (tHit < 0f) return false;

            var local = o + d * tHit;
            gridDirection = new Vector3(local.x / radii.x, local.y / radii.y, local.z / radii.z).normalized;
            worldPoint = transform.TransformPoint(local + center);
            var localNormal = new Vector3(local.x / (inflated.x * inflated.x), local.y / (inflated.y * inflated.y), local.z / (inflated.z * inflated.z)).normalized;
            worldNormal = transform.TransformDirection(localNormal).normalized;
            return true;
        }

        /// <summary>World position of the hair surface for a grid direction (+ extra metres outward).</summary>
        public Vector3 SurfacePoint(Vector3 gridDirection, float extra, out Vector3 worldNormal)
        {
            gridDirection.Normalize();
            HairGrid.ToAngles(gridDirection, out float lon, out float lat);
            float length = 0f;
            if (Grid != null)
            {
                int column = Mathf.Clamp(Mathf.FloorToInt((lon + 180f) / 360f * HairGrid.Columns), 0, HairGrid.Columns - 1);
                int row = Mathf.Clamp(Mathf.FloorToInt((lat - HairGrid.MinLatitude) / (HairGrid.MaxLatitude - HairGrid.MinLatitude) * HairGrid.Rows), 0, HairGrid.Rows - 1);
                length = Grid.LengthAt(column, row);
            }
            var normal = new Vector3(gridDirection.x / radii.x, gridDirection.y / radii.y, gridDirection.z / radii.z).normalized;
            var local = center + Vector3.Scale(gridDirection, radii) + normal * (baseOffset + length * volumePerCm + extra);
            worldNormal = transform.TransformDirection(normal).normalized;
            return transform.TransformPoint(local);
        }

        public Vector3 WorldCenter => transform.TransformPoint(center);

        private void OnDestroy()
        {
            if (_texture != null) Destroy(_texture);
            if (_material != null) Destroy(_material);
            if (_mesh != null) Destroy(_mesh);
        }
    }
}
