// Data structures produced by Track (see Track.cs). Field names match the JS objects;
// optional JS fields get a default that reads the same way the JS `undefined` did.
using System.Collections.Generic;

namespace Downfall
{
    public static class SURF
    {
        public const int ASPHALT = 0, DAMAGED = 1, GRAVEL = 2, DIRT = 3, MUD = 4, SNOW = 5, ICE = 6,
            GRASS = 7, ROCK = 8, WATER = 9, SAND = 10, CONCRETE = 11;
    }

    // mu: base friction, roll: rolling resistance multiplier, group: tyre compound class
    // (0 paved, 1 loose, 2 mud, 3 snow/ice), dust: particle amount, rough: vibration.
    public sealed class SurfInfo
    {
        public string name;
        public double mu, roll;
        public int group;
        public double dust, rough, splash, snow;
    }

    public static class RAIL
    {
        public const int NONE = 0, STEEL = 1, WOOD = 2, CONCRETE = 3;
    }

    // A Float32Array: stores round to float, reads widen to double (so the maths stays in
    // double like the JS). Out of range reads give NaN and writes are dropped, as in JS.
    public sealed class F32Array
    {
        public readonly float[] a;
        public F32Array(int n) { a = new float[n]; }
        public int Length => a.Length;
        public double this[int i]
        {
            get => (uint)i < (uint)a.Length ? a[i] : double.NaN;
            set { if ((uint)i < (uint)a.Length) a[i] = (float)value; }
        }
        public void Fill(double v) { float f = (float)v; for (int i = 0; i < a.Length; i++) a[i] = f; }
        public void Set(F32Array o) { System.Array.Copy(o.a, a, o.a.Length); }
    }

    // A Uint8Array (out of range reads give 0, writes are dropped).
    public sealed class U8Array
    {
        public readonly byte[] a;
        public U8Array(int n) { a = new byte[n]; }
        public int Length => a.Length;
        public int this[int i]
        {
            get => (uint)i < (uint)a.Length ? a[i] : 0;
            set { if ((uint)i < (uint)a.Length) a[i] = (byte)value; }
        }
        public void Fill(int v) { for (int i = 0; i < a.Length; i++) a[i] = (byte)v; }
    }

    // The `out` object of Track.Query.
    public sealed class TrackQuery
    {
        public double h, s, d, halfW, dist, hLeg;
        public int idx, surf;
    }

    // Track.PosAt result.
    public struct TrackPos
    {
        public double x, y, z, ry, hd;
    }

    // tunnels and bridges: sample range [a, b]; bridges carry a style ('concrete', 'truss', 'stone')
    public sealed class TrackSpan
    {
        public int a, b;
        public string style;
    }

    public sealed class TrackJump { public double s, h; }

    // kind 'drop' (a, b, sideA, sideB) or 'cut' (a, b, side)
    public sealed class TrackShortcut
    {
        public string kind;
        public int a, b, sideA, sideB, side;
        public double s0, s1, reward;
    }

    public sealed class TrackDecal { public double s0, s1, d0, d1; public int type; }
    public sealed class TrackPothole { public double s, d, r, depth; }
    public sealed class TrackRockfall { public double s; public int side; }
    public sealed class TrackRailGap { public int j, side; }

    // Collision shape: t 's' sphere (r) or 'b' yawed box (hx, hy, hz). The same class serves
    // obstacles, buildings and the world's breakables (brk/slow/dmg) and rockfall boulders.
    public sealed class WorldCollider
    {
        public string t;
        public double x, y, z, r, hx, hy, hz, yaw, s;
        public bool heavy, light;
        public double m;
        // knock-over state (barrels): x0 is NaN unless the collider has a home position
        public double vx, vy, vz, x0 = double.NaN, y0 = double.NaN, z0 = double.NaN;
        public bool hit, dead;
        public double brk = double.NaN, slow, dmg; // brk NaN: not breakable
        public double life;
        public bool rock;
        public string kind;
        public TrackObstacle @ref;
        public object animal, mesh, vis;
        public bool HasHome => !double.IsNaN(x0);
        public bool Breakable => !double.IsNaN(brk);
        public WorldCollider Clone() => (WorldCollider)MemberwiseClone();
    }

    // type 'rock' | 'tree' | 'car' | 'barrier' | 'barrel'
    public sealed class TrackObstacle
    {
        public string type;
        public double s, d, x, y, z, r;
        public double len, yaw;   // len: fallen trees; yaw: cars, trees
        public int side;          // fallen trees: the shoulder the root sits on
        public List<WorldCollider> colliders = new List<WorldCollider>();
    }

    // type 'fuel' | 'cash' | 'repair' | 'repairL' | 'rare' | 'crate'
    public sealed class TrackPickup
    {
        public string type;
        public double s, d, x, y, z;
        public bool free, risky;
    }

    public sealed class TrackSign
    {
        public string type;
        public double s;
        public int side;
        public bool outer, broken;
        public int km;
        public string text;
    }

    // Every roadside structure. type: house barn chapel farm pole snowpole fence logs gasstation
    // shack waterfall gantry grandstand tyres block finish. Only the fields the JS sets for a
    // type are meaningful (fence and waterfall have no x/y/z: they use s/d).
    public sealed class TrackProp
    {
        public string type;
        public double x, y, z, yaw, s, d;
        public double size = 1;       // JS reads `size || 1`
        public int seed;
        public bool collider;
        public double len;            // fence
        public int side;              // waterfall
        public double w, h, dep, tint; // gantry width / farm width; block w, dep, h, tint
        public string text;           // gantry
        // farm
        public double hd, dpt, fx, fz, rx, rz;
        public int sd;
        public string animal;
        public bool spawned;
        public WorldCollider col, col2; // col: buildings/grandstands/blocks, col2: tyre walls
    }
}
