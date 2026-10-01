using System;
using UnityEngine;

namespace BarberSimulator.Haircut
{
    /// <summary>
    /// The haircut simulation state: a latitude/longitude grid of scalp cells around the head, each holding a
    /// hair length in centimetres. Tools modify cells; zones/bands aggregate them for requests and scoring.
    /// Pure data + math (no rendering), so it can be unit-tested outside Unity.
    ///
    /// Head-local frame: +Z = face forward, +Y = up, +X = the customer's right. Longitude 0° is the nose,
    /// +90° the customer's right ear, ±180° the back. Latitude +90° is the top of the head.
    /// </summary>
    public sealed class HairGrid
    {
        public const int Columns = 56;
        public const int Rows = 30;
        public const float MinLatitude = -62f;
        public const float MaxLatitude = 90f;

        public struct Cell
        {
            public bool Grows;
            public HairZone Zone;
            public HairBand Band;
            public float Length;        // cm
            public float InitialLength; // cm
            public float Combed;        // 0..1, raised by the comb, decays over time
            public float Noise;         // static per-cell variation used for natural unevenness
        }

        private readonly Cell[] _cells = new Cell[Columns * Rows];

        public int Version { get; private set; }
        public bool Dirty { get; set; }

        public Cell this[int column, int row] => _cells[Index(column, row)];

        public static int Index(int column, int row) => row * Columns + ((column % Columns) + Columns) % Columns;

        public static float RowLatitude(int row) => Mathf.Lerp(MinLatitude, MaxLatitude, (row + 0.5f) / Rows);
        public static float ColumnLongitude(int column) => -180f + 360f * (column + 0.5f) / Columns;

        /// <summary>Unit direction of the centre of a cell.</summary>
        public static Vector3 CellDirection(int column, int row) => Direction(ColumnLongitude(column), RowLatitude(row));

        public static Vector3 Direction(float longitude, float latitude)
        {
            float lon = longitude * Mathf.Deg2Rad;
            float lat = latitude * Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(lat) * Mathf.Sin(lon), Mathf.Sin(lat), Mathf.Cos(lat) * Mathf.Cos(lon));
        }

        public static void ToAngles(Vector3 direction, out float longitude, out float latitude)
        {
            direction.Normalize();
            latitude = Mathf.Asin(Mathf.Clamp(direction.y, -1f, 1f)) * Mathf.Rad2Deg;
            longitude = Mathf.Atan2(direction.x, direction.z) * Mathf.Rad2Deg;
        }

        /// <summary>Where hair grows and which zone/band a direction belongs to.</summary>
        public static void Classify(float longitude, float latitude, out bool grows, out HairZone zone, out HairBand band)
        {
            float absLon = Mathf.Abs(longitude);
            bool left = longitude < 0f;
            grows = true;
            band = HairBand.Any;

            // Face, ears and below the hairline stay bare.
            if (absLon < 58f && latitude < 26f) { grows = false; zone = HairZone.None; return; }
            if (absLon >= 58f && absLon < 112f && latitude < -14f) { grows = false; zone = HairZone.None; return; } // ears / jaw
            if (absLon >= 112f && absLon < 140f && latitude < -42f) { grows = false; zone = HairZone.None; return; }
            if (latitude < -58f) { grows = false; zone = HairZone.None; return; }

            if (latitude >= 58f)
            {
                zone = absLon > 125f && latitude < 74f ? HairZone.Crown : HairZone.Top;
                return;
            }

            if (absLon < 58f)
            {
                zone = latitude < 44f ? HairZone.Front : HairZone.Top;
                return;
            }

            if (absLon < 84f && latitude < 30f)
            {
                zone = left ? HairZone.LeftTemple : HairZone.RightTemple;
                return;
            }

            if (absLon < 132f)
            {
                if (latitude >= 40f) { zone = HairZone.Top; return; }
                zone = left ? HairZone.LeftSide : HairZone.RightSide;
                band = latitude < 4f ? HairBand.Lower : latitude < 22f ? HairBand.Middle : HairBand.Upper;
                return;
            }

            // Back of the head.
            if (latitude >= 44f) { zone = HairZone.Crown; return; }
            if (latitude < -32f) { zone = HairZone.Nape; return; }
            zone = HairZone.Back;
            band = latitude < -8f ? HairBand.Lower : latitude < 16f ? HairBand.Middle : HairBand.Upper;
        }

        /// <summary>Grows a fresh head of hair from a style (lengths in cm per zone).</summary>
        public void Initialize(HairStyleLengths style, int seed)
        {
            var rng = new System.Random(seed);
            for (int r = 0; r < Rows; r++)
            {
                for (int c = 0; c < Columns; c++)
                {
                    Classify(ColumnLongitude(c), RowLatitude(r), out bool grows, out HairZone zone, out HairBand band);
                    float noise = (float)rng.NextDouble() * 2f - 1f;
                    float length = grows ? Mathf.Max(0f, style.LengthFor(zone, band) * (1f + noise * style.Unevenness)) : 0f;
                    _cells[Index(c, r)] = new Cell
                    {
                        Grows = grows,
                        Zone = zone,
                        Band = band,
                        Length = length,
                        InitialLength = length,
                        Noise = noise
                    };
                }
            }
            SmoothInitialEdges();
            Version++;
            Dirty = true;
        }

        /// <summary>Soft transition of the grown-out lengths so a fresh head never shows hard zone borders.</summary>
        private void SmoothInitialEdges()
        {
            var copy = (Cell[])_cells.Clone();
            for (int r = 0; r < Rows; r++)
            for (int c = 0; c < Columns; c++)
            {
                var cell = copy[Index(c, r)];
                if (!cell.Grows) continue;
                float sum = 0f; int n = 0;
                for (int dr = -1; dr <= 1; dr++)
                for (int dc = -1; dc <= 1; dc++)
                {
                    int rr = r + dr;
                    if (rr < 0 || rr >= Rows) continue;
                    var other = copy[Index(c + dc, rr)];
                    if (!other.Grows) continue;
                    sum += other.Length; n++;
                }
                float smoothed = n > 0 ? sum / n : cell.Length;
                float length = Mathf.Lerp(cell.Length, smoothed, 0.6f);
                _cells[Index(c, r)].Length = length;
                _cells[Index(c, r)].InitialLength = length;
            }
        }

        public delegate float CellOperation(ref Cell cell, float weight);

        /// <summary>
        /// Applies an operation to every growing cell within <paramref name="radiusDegrees"/> of
        /// <paramref name="direction"/>, with a smooth falloff towards the brush edge.
        /// Returns the summed amount of length removed (cm) so tools can drive feedback.
        /// </summary>
        public float ApplyBrush(Vector3 direction, float radiusDegrees, CellOperation operation)
        {
            direction.Normalize();
            float cosRadius = Mathf.Cos(radiusDegrees * Mathf.Deg2Rad);
            ToAngles(direction, out _, out float latitude);
            float latitudeSpan = radiusDegrees + 2f;
            float removed = 0f;

            for (int r = 0; r < Rows; r++)
            {
                if (Mathf.Abs(RowLatitude(r) - latitude) > latitudeSpan) continue;
                for (int c = 0; c < Columns; c++)
                {
                    int i = Index(c, r);
                    if (!_cells[i].Grows) continue;
                    float dot = Vector3.Dot(CellDirection(c, r), direction);
                    if (dot < cosRadius) continue;
                    float angle = Mathf.Acos(Mathf.Clamp(dot, -1f, 1f)) * Mathf.Rad2Deg;
                    float weight = 1f - Mathf.SmoothStep(0f, 1f, angle / radiusDegrees);
                    float before = _cells[i].Length;
                    operation(ref _cells[i], weight);
                    removed += Mathf.Max(0f, before - _cells[i].Length);
                }
            }

            if (removed > 0f || operation != null)
            {
                Version++;
                Dirty = true;
            }
            return removed;
        }

        /// <summary>Average length of the cells inside a brush (used for scissor-over-comb evening).</summary>
        public float AverageInBrush(Vector3 direction, float radiusDegrees)
        {
            direction.Normalize();
            float cosRadius = Mathf.Cos(radiusDegrees * Mathf.Deg2Rad);
            float sum = 0f; int n = 0;
            for (int r = 0; r < Rows; r++)
            for (int c = 0; c < Columns; c++)
            {
                var cell = _cells[Index(c, r)];
                if (!cell.Grows || Vector3.Dot(CellDirection(c, r), direction) < cosRadius) continue;
                sum += cell.Length; n++;
            }
            return n > 0 ? sum / n : 0f;
        }

        public void DecayComb(float deltaTime)
        {
            for (int i = 0; i < _cells.Length; i++)
                if (_cells[i].Combed > 0f) _cells[i].Combed = Mathf.Max(0f, _cells[i].Combed - deltaTime / 25f);
        }

        /// <summary>Statistics for a zone (and band). Only growing cells count.</summary>
        public ZoneStats Stats(HairZone zone, HairBand band = HairBand.Any)
        {
            var stats = new ZoneStats();
            float min = float.MaxValue, max = 0f;
            for (int i = 0; i < _cells.Length; i++)
            {
                var cell = _cells[i];
                if (!cell.Grows || cell.Zone != zone) continue;
                if (band != HairBand.Any && cell.Band != band) continue;
                stats.Count++;
                stats.Average += cell.Length;
                stats.InitialAverage += cell.InitialLength;
                min = Mathf.Min(min, cell.Length);
                max = Mathf.Max(max, cell.Length);
                if (cell.InitialLength - cell.Length > 0.15f) stats.TouchedCount++;
            }
            if (stats.Count > 0)
            {
                stats.Average /= stats.Count;
                stats.InitialAverage /= stats.Count;
                stats.Min = min;
                stats.Max = max;
            }
            return stats;
        }

        /// <summary>Visits every growing cell (for scoring and debug overlays).</summary>
        public void ForEach(Action<int, int, Cell> visitor)
        {
            for (int r = 0; r < Rows; r++)
            for (int c = 0; c < Columns; c++)
            {
                var cell = _cells[Index(c, r)];
                if (cell.Grows) visitor(c, r, cell);
            }
        }

        public float LengthAt(int column, int row) => _cells[Index(column, row)].Length;
        public bool GrowsAt(int column, int row) => row >= 0 && row < Rows && _cells[Index(column, row)].Grows;
    }

    public struct ZoneStats
    {
        public int Count;
        public int TouchedCount;
        public float Average;
        public float InitialAverage;
        public float Min;
        public float Max;

        public float TouchedFraction => Count > 0 ? (float)TouchedCount / Count : 0f;
    }
}
