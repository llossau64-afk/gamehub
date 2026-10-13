// Pooled particles (one draw per blend mode) + tyre mark ribbons + loose rigid debris.
// Port of particles.js: the simulation runs in game coordinates exactly as in the browser
// build; each frame the live particles become camera-facing quads in one dynamic mesh.
using System;
using System.Collections.Generic;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Downfall
{
    public static class FxMats
    {
        static Texture2D soft;
        public static Texture2D SoftSprite()
        {
            if (soft) return soft;
            const int S = 64;
            soft = new Texture2D(S, S, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, name = "soft" };
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float d = Mathf.Sqrt((x + 0.5f - S / 2f) * (x + 0.5f - S / 2f) + (y + 0.5f - S / 2f) * (y + 0.5f - S / 2f)) / (S / 2f);
                    float a = d < 0.4f ? Mathf.Lerp(1, 0.55f, d / 0.4f) : d < 1 ? Mathf.Lerp(0.55f, 0, (d - 0.4f) / 0.6f) : 0;
                    px[y * S + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            soft.SetPixels32(px);
            soft.Apply(true);
            return soft;
        }

        public static Material Make(string shader, Texture tex, string fallback = "Sprites/Default")
        {
            var sh = Shader.Find(shader) ?? Shader.Find(fallback);
            var m = new Material(sh);
            if (tex) m.mainTexture = tex;
            return m;
        }
    }

    public sealed class PointPool
    {
        public readonly int n;
        readonly Vector3[] p, v;
        readonly float[] life, max, size0, size1, a0, grav, drag, size, alpha;
        readonly Color[] col;
        int cursor;
        readonly Mesh mesh;
        readonly Vector3[] verts;
        readonly Color[] cols;
        readonly Vector2[] uvs;
        readonly Material mat;

        public PointPool(int n, bool additive)
        {
            this.n = n;
            p = new Vector3[n]; v = new Vector3[n];
            life = new float[n]; max = new float[n]; size0 = new float[n]; size1 = new float[n];
            a0 = new float[n]; grav = new float[n]; drag = new float[n]; size = new float[n]; alpha = new float[n];
            col = new Color[n];
            mesh = new Mesh { name = additive ? "glow" : "soft" };
            mesh.MarkDynamic();
            verts = new Vector3[n * 4]; cols = new Color[n * 4]; uvs = new Vector2[n * 4];
            var idx = new int[n * 6];
            for (int i = 0; i < n; i++)
            {
                int b = i * 4;
                idx[i * 6] = b; idx[i * 6 + 1] = b + 1; idx[i * 6 + 2] = b + 2; idx[i * 6 + 3] = b; idx[i * 6 + 4] = b + 2; idx[i * 6 + 5] = b + 3;
                uvs[b] = new Vector2(0, 0); uvs[b + 1] = new Vector2(0, 1); uvs[b + 2] = new Vector2(1, 1); uvs[b + 3] = new Vector2(1, 0);
            }
            if (n * 4 > 65535) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.vertices = verts; mesh.colors = cols; mesh.uv = uvs; mesh.triangles = idx;
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 1e6f);
            mat = FxMats.Make("Downfall/Particle", FxMats.SoftSprite());
            mat.SetFloat("_Src", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetFloat("_Dst", (float)(additive ? UnityEngine.Rendering.BlendMode.One : UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha));
            mat.SetFloat("_Fog", additive ? 0 : 1);
            mat.renderQueue = 3000 + (additive ? 10 : 0);
        }

        public void Emit(float x, float y, float z, float vx, float vy, float vz, float life, float s0, float s1, float a0, float r, float gg, float b, float grav = 0, float drag = 0.5f)
        {
            int i = cursor; cursor = (cursor + 1) % n;
            p[i] = new Vector3(x, y, z); v[i] = new Vector3(vx, vy, vz);
            this.life[i] = life; max[i] = life; size0[i] = s0; size1[i] = s1; this.a0[i] = a0;
            col[i] = new Color(r, gg, b, 1);
            this.grav[i] = grav; this.drag[i] = drag;
        }

        public void Update(float dt)
        {
            for (int i = 0; i < n; i++)
            {
                if (life[i] <= 0) { alpha[i] = 0; continue; }
                life[i] -= dt;
                float t = 1 - life[i] / max[i];
                float dr = Mathf.Exp(-drag[i] * dt);
                v[i].x *= dr; v[i].y = v[i].y * dr - grav[i] * dt; v[i].z *= dr;
                p[i] += v[i] * dt;
                size[i] = size0[i] + (size1[i] - size0[i]) * t;
                alpha[i] = a0[i] * (t < 0.1f ? t / 0.1f : 1 - (t - 0.1f) / 0.9f);
            }
        }

        // builds camera-facing quads; a point of size s covers s * 0.9 * 2 tan(fov/2) metres
        public void Draw(Camera cam)
        {
            if (!cam) return;
            Vector3 right = cam.transform.right, up = cam.transform.up;
            float k = 0.9f * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad); // half-size per unit
            bool any = false;
            for (int i = 0; i < n; i++)
            {
                int b = i * 4;
                if (alpha[i] <= 0.004f || life[i] <= 0)
                {
                    verts[b] = verts[b + 1] = verts[b + 2] = verts[b + 3] = Vector3.zero;
                    continue;
                }
                any = true;
                var c = Coord.ToUnity(p[i]);
                float h = size[i] * k;
                Vector3 rx = right * h, uy = up * h;
                verts[b] = c - rx - uy; verts[b + 1] = c - rx + uy; verts[b + 2] = c + rx + uy; verts[b + 3] = c + rx - uy;
                var cc = col[i]; cc.a = alpha[i];
                cols[b] = cols[b + 1] = cols[b + 2] = cols[b + 3] = cc;
            }
            if (!any) return;
            mesh.vertices = verts; mesh.colors = cols;
            Graphics.DrawMesh(mesh, Matrix4x4.identity, mat, 0, null, 0, null, false, false);
        }

        public void Clear() { Array.Clear(life, 0, n); Array.Clear(alpha, 0, n); }
    }

    public sealed class Particles
    {
        public readonly PointPool soft, glow;
        readonly float q;
        static float R() => Random.value;

        public Particles(string quality)
        {
            int n = quality == "low" ? 900 : quality == "high" ? 3000 : 2000;
            soft = new PointPool(n, false);
            glow = new PointPool(Mathf.RoundToInt(n / 3f), true);
            q = quality == "low" ? 0.5f : 1;
        }
        public void Update(float dt) { soft.Update(dt); glow.Update(dt); }
        public void Draw(Camera cam) { soft.Draw(cam); glow.Draw(cam); }
        public void Clear() { soft.Clear(); glow.Clear(); }

        public void Dust(float x, float y, float z, float vx, float vz, float amount, Color c)
        {
            if (R() > amount * q) return;
            soft.Emit(x + (R() - 0.5f) * 0.4f, y + 0.1f, z + (R() - 0.5f) * 0.4f, vx * 0.2f + (R() - 0.5f), 0.6f + R() * 0.8f, vz * 0.2f + (R() - 0.5f),
                1.4f + R() * 1.4f, 0.6f, 3.2f + R() * 2, 0.32f, c.r, c.g, c.b, -0.15f, 0.9f);
        }
        public void Smoke(float x, float y, float z, float vx, float vy, float vz, bool dark, float size = 1)
        {
            float c = dark ? 0.12f + R() * 0.06f : 0.62f + R() * 0.1f;
            soft.Emit(x, y, z, vx + (R() - 0.5f) * 0.6f, vy + 0.8f + R() * 0.6f, vz + (R() - 0.5f) * 0.6f, 1.6f + R(), 0.4f * size, 2.6f * size, dark ? 0.55f : 0.32f, c, c, c * 1.02f, -0.5f, 1.2f);
        }
        public void TireSmoke(float x, float y, float z, float vx, float vz)
        {
            soft.Emit(x, y + 0.15f, z, vx * 0.3f + (R() - 0.5f), 0.5f + R() * 0.5f, vz * 0.3f + (R() - 0.5f), 1.8f + R(), 0.5f, 4 + R() * 2, 0.28f, 0.85f, 0.85f, 0.86f, -0.1f, 0.8f);
        }
        public void Splash(float x, float y, float z, float vx, float vz, bool mud)
        {
            for (int k = 0; k < 3; k++)
            {
                Color c = mud ? new Color(0.25f, 0.19f, 0.12f) : new Color(0.75f, 0.8f, 0.85f);
                soft.Emit(x, y + 0.1f, z, vx * 0.3f + (R() - 0.5f) * 3, 1.5f + R() * 2.5f, vz * 0.3f + (R() - 0.5f) * 3, 0.6f + R() * 0.4f, 0.2f, 0.5f, mud ? 0.9f : 0.5f, c.r, c.g, c.b, 9.8f, 0.5f);
            }
        }
        public void SnowSpray(float x, float y, float z, float vx, float vz)
        {
            soft.Emit(x, y + 0.1f, z, vx * 0.25f + (R() - 0.5f) * 1.5f, 0.8f + R(), vz * 0.25f + (R() - 0.5f) * 1.5f, 1 + R(), 0.3f, 1.8f, 0.6f, 0.93f, 0.95f, 0.98f, 2, 1.2f);
        }
        public void Sparks(float x, float y, float z, float vx, float vy, float vz, int n = 8)
        {
            for (int k = 0; k < n * q; k++)
                glow.Emit(x, y, z, vx * 0.5f + (R() - 0.5f) * 6, vy + R() * 4, vz * 0.5f + (R() - 0.5f) * 6, 0.25f + R() * 0.4f, 0.12f, 0.04f, 1, 1, 0.6f + R() * 0.3f, 0.2f, 9.8f, 0.4f);
        }
        public void Debris(float x, float y, float z, float vx, float vy, float vz, int n, Color c)
        {
            for (int k = 0; k < n; k++) soft.Emit(x, y, z, vx * 0.4f + (R() - 0.5f) * 5, vy + R() * 4, vz * 0.4f + (R() - 0.5f) * 5, 0.8f + R() * 0.6f, 0.15f, 0.12f, 1, c.r, c.g, c.b, 9.8f, 0.2f);
        }
        public void Glass(float x, float y, float z, float vx, float vy, float vz)
        {
            for (int k = 0; k < 14 * q; k++) glow.Emit(x, y, z, vx * 0.4f + (R() - 0.5f) * 4, vy + R() * 3, vz * 0.4f + (R() - 0.5f) * 4, 0.6f + R() * 0.5f, 0.07f, 0.05f, 0.6f, 0.7f, 0.8f, 0.9f, 9.8f, 0.3f);
        }
        public void Burst(float x, float y, float z, Color c, int n = 30)
        {
            for (int k = 0; k < n; k++) glow.Emit(x, y + 0.4f, z, (R() - 0.5f) * 5, R() * 5, (R() - 0.5f) * 5, 0.6f + R() * 0.5f, 0.25f, 0.05f, 0.9f, c.r, c.g, c.b, 6, 1);
        }
        public void Mist(float x, float y, float z)
        {
            soft.Emit(x + (R() - 0.5f) * 6, y, z + (R() - 0.5f) * 6, (R() - 0.5f) * 2, 1 + R(), (R() - 0.5f) * 2, 3, 2, 8, 0.15f, 0.9f, 0.93f, 0.96f, -0.1f, 0.5f);
        }
    }

    // Tyre marks: ring buffer of quads, darkening what's under them (multiply blend).
    public sealed class SkidMarks
    {
        readonly int max;
        readonly Vector3[] pos;
        readonly Color[] col;
        readonly Mesh mesh;
        readonly Material mat;
        int cursor;
        bool dirty;
        readonly float[][] last = new float[64][];

        public SkidMarks(int max = 6000)
        {
            this.max = max;
            pos = new Vector3[max * 4]; col = new Color[max * 4];
            for (int i = 0; i < col.Length; i++) col[i] = Color.white;
            var idx = new int[max * 6];
            // b, b+2, b+1 / b+1, b+2, b+3 in game space; Coord mirrors x so the winding flips
            for (int i = 0; i < max; i++) { int b = i * 4; idx[i * 6] = b; idx[i * 6 + 1] = b + 1; idx[i * 6 + 2] = b + 2; idx[i * 6 + 3] = b + 1; idx[i * 6 + 4] = b + 3; idx[i * 6 + 5] = b + 2; }
            mesh = new Mesh { name = "skids", indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            mesh.MarkDynamic();
            mesh.vertices = pos; mesh.colors = col; mesh.triangles = idx;
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 1e6f);
            mat = FxMats.Make("Downfall/Skid", null);
            mat.renderQueue = 2460;
        }

        // a segment for wheel i at game point (x,y,z) with lateral dir (rx,rz), width w, intensity a (0..1)
        public void Add(int i, float x, float y, float z, float rx, float rz, float w, float a)
        {
            var L = last[i];
            if (L != null && a > 0.02f)
            {
                float dx = x - L[0], dz = z - L[2];
                float d2 = dx * dx + dz * dz;
                if (d2 < 0.09f) return;
                if (d2 < 9)
                {
                    int c = cursor; cursor = (cursor + 1) % max;
                    int o = c * 4;
                    float hw = w / 2;
                    pos[o] = Coord.ToUnity(new Vector3(L[0] - L[3] * hw, L[1], L[2] - L[4] * hw));
                    pos[o + 1] = Coord.ToUnity(new Vector3(L[0] + L[3] * hw, L[1], L[2] + L[4] * hw));
                    pos[o + 2] = Coord.ToUnity(new Vector3(x - rx * hw, y, z - rz * hw));
                    pos[o + 3] = Coord.ToUnity(new Vector3(x + rx * hw, y, z + rz * hw));
                    float k0 = 1 - L[5] * 0.78f, k1 = 1 - a * 0.78f;
                    col[o] = col[o + 1] = new Color(k0, k0, k0, 1);
                    col[o + 2] = col[o + 3] = new Color(k1, k1, k1, 1);
                    dirty = true;
                }
            }
            last[i] = a > 0.02f ? new[] { x, y, z, rx, rz, a } : null;
        }

        public void Draw()
        {
            if (dirty) { mesh.vertices = pos; mesh.colors = col; dirty = false; }
            Graphics.DrawMesh(mesh, Matrix4x4.identity, mat, 0, null, 0, null, false, false);
        }

        public void Clear()
        {
            for (int i = 0; i < col.Length; i++) { col[i] = Color.white; pos[i] = Vector3.zero; }
            for (int i = 0; i < last.Length; i++) last[i] = null;
            dirty = true;
        }
    }

    // Loose rigid pieces (bumpers, rail sections, barrels) with cheap physics, in Unity space.
    public sealed class Debris
    {
        sealed class Item { public Transform t; public Vector3 v, w; public float life, groundOff; }
        readonly List<Item> items = new List<Item>();
        readonly Func<double, double, double> height; // game-space terrain height

        public Debris(Func<double, double, double> height) { this.height = height; }

        // vel and spin are in game space, like the browser build
        public void Add(Transform t, Vector3 vel, Vector3 spin, float groundOff = 0.1f)
        {
            items.Add(new Item { t = t, v = Coord.ToUnity(vel), w = new Vector3(spin.x, -spin.y, -spin.z), life = 12, groundOff = groundOff });
            if (items.Count > 40) Remove(items[0]);
        }

        void Remove(Item it)
        {
            if (it.t) UnityEngine.Object.Destroy(it.t.gameObject);
            items.Remove(it);
        }

        public void Update(float dt)
        {
            for (int i = items.Count - 1; i >= 0; i--)
            {
                var it = items[i];
                it.life -= dt;
                if (it.life <= 0 || !it.t) { Remove(it); continue; }
                it.v.y -= 9.8f * dt;
                var p = it.t.position + it.v * dt;
                it.t.Rotate(it.w * (dt * Mathf.Rad2Deg), Space.Self);
                float h = (float)height(-p.x, p.z) + it.groundOff;
                if (p.y < h)
                {
                    p.y = h;
                    if (it.v.y < 0) it.v.y *= -0.3f;
                    it.v.x *= 0.7f; it.v.z *= 0.7f; it.w *= 0.6f;
                }
                it.t.position = p;
            }
        }

        public void Clear() { while (items.Count > 0) Remove(items[0]); }
    }
}
