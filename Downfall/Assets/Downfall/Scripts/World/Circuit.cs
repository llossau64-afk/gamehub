// Port of src/models/circuit.js: circuit furniture (grandstands with a crowd, tyre walls,
// kerbs, city blocks). Everything is built once and instanced by the world.
using System.Collections.Generic;
using UnityEngine;

namespace Downfall
{
    public static class CIR
    {
        static Geo ColorBox(double w, double h, double d, double x, double y, double z, int col) =>
            Geo.Box(w, h, d).Translate(x, y, z).ColorAll(G.Lin(col));

        static Texture2D crowdTex;
        // circuit.js crowdTexture() (used when the baked Generated/crowd texture is missing)
        public static Texture2D CrowdTexture()
        {
            if (crowdTex) return crowdTex;
            const int W = 512, Hh = 64;
            var px = new Color32[W * Hh];
            var bg = (Color32)MatDef.Hex(0x3a3c40);
            for (int i = 0; i < px.Length; i++) px[i] = bg;
            var r = new Rng(77);
            int[] shirts = { 0xd8d4cc, 0xc23b2a, 0x2f5fa8, 0xe2a33b, 0x2b2b2e, 0x5b8a3a, 0xe8e2d0, 0x8a2a3a, 0xf0c040, 0x3a7ab8 };
            int[] skin = { 0xe8c4a0, 0xc49a74, 0x8a6448, 0xf0d4b8 };
            void Rect(double x, double y, double w, double h, int col)
            {
                var c = (Color32)MatDef.Hex(col);
                for (int yy = (int)y; yy < (int)(y + h); yy++)
                    for (int xx = (int)x; xx < (int)(x + w); xx++)
                        if (xx >= 0 && xx < W && yy >= 0 && yy < Hh) px[(Hh - 1 - yy) * W + xx] = c;
            }
            void Disc(double cx, double cy, double rad, int col)
            {
                var c = (Color32)MatDef.Hex(col);
                for (int yy = (int)(cy - rad); yy <= (int)(cy + rad); yy++)
                    for (int xx = (int)(cx - rad); xx <= (int)(cx + rad); xx++)
                        if ((xx + 0.5 - cx) * (xx + 0.5 - cx) + (yy + 0.5 - cy) * (yy + 0.5 - cy) <= rad * rad && xx >= 0 && xx < W && yy >= 0 && yy < Hh) px[(Hh - 1 - yy) * W + xx] = c;
            }
            for (int x = 2; x < 512; x += 7)
                foreach (int y0 in new[] { 6, 38 })
                {
                    double y = y0 + r.Next() * 4;
                    Rect(x, y + 9, 5, 12, shirts[(int)(r.Next() * shirts.Length)]);
                    Disc(x + 2.5, y + 6, 2.6, skin[(int)(r.Next() * 4)]);
                    if (r.Next() < 0.12) Rect(x - 1, y - 4, 7, 5, shirts[(int)(r.Next() * shirts.Length)]);
                }
            crowdTex = new Texture2D(W, Hh, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat, anisoLevel = 4, name = "crowd" };
            crowdTex.SetPixels32(px);
            crowdTex.Apply(true);
            return crowdTex;
        }

        // A 24 m grandstand facing -x (the road side), origin at the front foot.
        public static PartSet GrandstandParts() => Parts.Multi("stand", () =>
        {
            const double L = 24, sd = 1.1, sh = 0.62; const int steps = 7;
            var s = new List<Geo>();
            for (int i = 0; i < steps; i++) s.Add(ColorBox(sd, sh * (i + 1), L, sd * (i + 0.5), sh * (i + 1) / 2, 0, i % 2 != 0 ? 0x8d9096 : 0x9ea1a6));
            s.Add(ColorBox(0.3, sh * steps + 4.2, L, sd * steps + 0.15, (sh * steps + 4.2) / 2, 0, 0x6c7076));
            s.Add(ColorBox(0.4, 1.1, L, -0.2, 0.55, 0, 0xd8d6d0));
            double roofY = sh * steps + 4.2;
            s.Add(ColorBox(sd * steps + 2.4, 0.25, L + 0.6, sd * steps / 2 - 0.6, roofY, 0, 0xe6e4de));
            for (int k = -2; k <= 2; k++) s.Add(ColorBox(0.22, roofY, 0.22, sd * steps, roofY / 2, k * L / 4.4, 0x50545a));
            s.Add(ColorBox(0.06, 0.7, L, -0.42, 0.75, 0, 0xb83224));
            for (int i = 0; i < s.Count; i++) s[i] = s[i].ToNonIndexed();
            var structMesh = Geo.Merge(s).ToMesh("stand_struct");
            var crowd = new List<Geo>();
            for (int i = 0; i < steps; i++)
            {
                var pl = Geo.Plane(L - 0.4, 0.9, 1, 1).RotateY(-Mathf.PI / 2).Translate(sd * i + 0.12, sh * (i + 1) + 0.45, 0);
                for (int k = 0; k < pl.Count; k++) pl.uv[k] = new Vector2(pl.uv[k].x * 3 + i * 0.37f, pl.uv[k].y * 0.5f + (i % 2) * 0.5f);
                crowd.Add(pl);
            }
            var crowdMesh = Geo.Merge(crowd).ToMesh("stand_crowd");
            var mStruct = WorldMats.VC("standStruct");
            Material mCrowd;
            if (Mats.Tex("Generated/crowd") != null) mCrowd = WorldMats.Get("crowd");
            else
            {
                mCrowd = Mats.Create(new MatDef("crowdRuntime", Color.white, 0.95f).TwoSided());
                mCrowd.SetTexture("_BaseMap", CrowdTexture()); mCrowd.mainTexture = CrowdTexture();
            }
            mStruct.enableInstancing = true; mCrowd.enableInstancing = true;
            var ps = new PartSet { name = "stand" };
            ps.parts.Add(new Part { mesh = structMesh, mat = mStruct });
            ps.parts.Add(new Part { mesh = crowdMesh, mat = mCrowd });
            ps.bounds = structMesh.bounds;
            return ps;
        });

        // A stack of three tyres, 0.8 m across; laid in rows along corners.
        public static PartSet TyreParts() => Parts.FromGeo("tyres", () =>
        {
            var g = new List<Geo>();
            for (int k = 0; k < 3; k++) g.Add(Geo.Torus(0.31, 0.12, 6, 12).RotateX(Mathf.PI / 2).Translate(0, 0.12 + k * 0.24, 0));
            return Geo.Merge(g);
        }, WorldMats.Color("tyreRubber", 0x1c1c1e, 0.9f));

        // One kerb block: 1.6 m long (z), 1 m wide (x), red or white.
        public static PartSet KerbParts(bool red) => Parts.FromGeo(red ? "kerb1" : "kerb0", () => Geo.Box(1, 0.1, 1.6),
            red ? WorldMats.Color("kerbRed", 0xc0281e, 0.6f) : WorldMats.Color("kerbWhite", 0xe8e6e0, 0.6f));

        // City block: a unit box (origin at the base) scaled per instance; windows come from the
        // world position in the Downfall/CityBlock shader so every scale looks right.
        static PartSet blockSet;
        public static PartSet BlockParts()
        {
            if (blockSet != null) return blockSet;
            Material m;
            var sh = WorldMats.Find("Downfall/CityBlock");
            if (sh != null) m = new Material(sh) { name = "cityBlock", enableInstancing = true };
            else m = WorldMats.Color("cityBlock", 0xb8b2a6, 0.8f, 0.05f);
            return blockSet = Parts.FromGeo("block",() => Geo.Box(1, 1, 1).Translate(0, 0.5, 0), m);
        }
    }
}
