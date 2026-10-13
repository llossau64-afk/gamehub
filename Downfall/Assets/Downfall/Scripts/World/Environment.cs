// Port of src/world/env.js. Atmosphere: sky (procedural skybox with drifting clouds), sun +
// shadows, hemisphere ambient, fog, distant mountain ranges, valley floor, reflections,
// weather (snow / rain / dust around the camera), lightning and birds. Everything blends
// continuously with the biome under the player (Env.LookAt).
//
// Per frame: env.Update(dt, track, s, camera, focusGame, inTunnel); then read env.look and env.tunnel.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using Random = UnityEngine.Random;

namespace Downfall
{
    /// <summary>env.js lookAt() result. Colours are UnityEngine.Color in sRGB like MatDef.Hex (blended in
    /// linear space as three.js does); numbers interpolate. As in the JS, `snow` ends up being the
    /// blended *snow weather* weight (the weather keys overwrite the numeric look.snow).</summary>
    public sealed class EnvLook
    {
        public Color skyTop, skyHorizon, fog, sun, hemiSky, hemiGround, grass, dirt, rock;
        public double fogDensity, sunIntensity, sunElev, sunAzim, hemiIntensity, snow, clouds, cloudDark, wind, birds, warmth;
        public double rain, storm, dust;
    }

    public sealed class EnvEvent { public string type; public double delay, power; }

    public sealed class Env
    {
        public readonly string quality;
        public double time, flash;
        public readonly List<EnvEvent> events = new List<EnvEvent>();
        /// <summary>When true (default) the scheduled thunder plays through AudioSys.A itself.</summary>
        public bool autoThunder = true;
        public EnvLook look;
        public double tunnel;          // 0..1 tunnel darkness the game reads
        public Vector3 sunDir = Vector3.up; // game space
        /// <summary>three.js (physical lights, /π BRDF, ×1.75 post exposure) to Unity light intensity.</summary>
        public float lightScale = 0.56f;

        public readonly GameObject root;
        public readonly Light sun;
        readonly Material skyMat, floorMat;
        readonly GameObject floor;
        readonly GameObject ridges;
        readonly Material[] ridgeMats = new Material[3];
        readonly float[] ridgeHaze = { 0.25f, 0.45f, 0.62f };
        long lastEnvKey = long.MinValue;
        double envTime = -99;

        public Env(string quality = "medium", Transform parent = null)
        {
            this.quality = quality;
            root = new GameObject("environment");
            if (parent) root.transform.SetParent(parent, false);

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = 0.003f;
            RenderSettings.fogColor = MatDef.Hex(0xb0bcc4);

            // sky
            var sh = WorldMats.Find("Downfall/Sky");
            if (sh != null)
            {
                skyMat = new Material(sh) { name = "sky" };
                if (quality != "low") skyMat.EnableKeyword("SKY_HQ");
                RenderSettings.skybox = skyMat;
            }

            // lights
            var so = new GameObject("sun");
            so.transform.SetParent(root.transform, false);
            sun = so.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = quality != "low" ? LightShadows.Soft : LightShadows.None;
            sun.shadowBias = 0.05f; sun.shadowNormalBias = 0.4f;
            sun.shadowResolution = quality == "high" ? LightShadowResolution.High : LightShadowResolution.Medium;
            RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            QualitySettings.shadowDistance = quality == "high" ? 110 : 85;

            // distant ranges
            ridges = new GameObject("ridges");
            ridges.transform.SetParent(root.transform, false);
            var r = new Rng(77);
            double[][] defs = { new double[] { 2400, 520, 0.25 }, new double[] { 3300, 760, 0.45 }, new double[] { 4300, 1050, 0.62 } };
            var rsh = WorldMats.Find("Downfall/Ridge");
            for (int li = 0; li < 3; li++)
            {
                double rad = defs[li][0], amp = defs[li][1];
                const int seg = 160;
                var g = new Geo();
                for (int i = 0; i <= seg; i++)
                {
                    double a = (double)i / seg * Math.PI * 2;
                    double n = Math.Abs(Math.Sin(a * 3 + li) * 0.5 + Math.Sin(a * 7.3 + li * 2) * 0.3 + Math.Sin(a * 17.1 + li) * 0.15 + Math.Sin(a * 41 + li) * 0.05);
                    double h = 40 + n * amp * 0.62 * (0.6 + r.Next() * 0.4);
                    double x = Math.Cos(a) * rad, z = Math.Sin(a) * rad;
                    g.Add(G.V(x, -700, z), Vector3.up, new Vector2(0, 0));
                    g.Add(G.V(x * 1.002, h, z * 1.002), Vector3.up, new Vector2((float)n, 0));
                    if (i < seg) { int b = i * 2; g.Tri(b, b + 2, b + 1); g.Tri(b + 1, b + 2, b + 3); }
                }
                var mesh = g.ToMesh("ridge" + li);
                mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 20000);
                var o = new GameObject("ridge" + li);
                o.transform.SetParent(ridges.transform, false);
                o.AddComponent<MeshFilter>().sharedMesh = mesh;
                var mr = o.AddComponent<MeshRenderer>();
                mr.shadowCastingMode = ShadowCastingMode.Off; mr.receiveShadows = false;
                Material m;
                if (rsh != null) { m = new Material(rsh) { name = "ridge" + li }; m.renderQueue = 1000 + (2 - li); }
                else m = Mats.Create(new MatDef("ridge" + li, MatDef.Hex(0x4a5058), 1f).Unlit().TwoSided());
                m.SetFloat("_HazeAmt", ridgeHaze[li]);
                m.SetColor("_Snow", MatDef.Hex(0xe8eef4));
                m.SetFloat("_SnowLine", 300 + li * 150);
                mr.sharedMaterial = m;
                ridgeMats[li] = m;
            }

            // valley floor far below
            floorMat = Mats.Create(new MatDef("valleyFloor", MatDef.Hex(0x3a4430), 1f));
            floor = new GameObject("floor");
            floor.transform.SetParent(root.transform, false);
            var fm = Geo.Plane(9000, 9000).RotateX(-Math.PI / 2).ToMesh("floor");
            floor.AddComponent<MeshFilter>().sharedMesh = fm;
            var fr = floor.AddComponent<MeshRenderer>();
            fr.sharedMaterial = floorMat; fr.shadowCastingMode = ShadowCastingMode.Off;

            MakeWeather(quality);
            MakeBirds();
            tunnel = 0;
        }

        static Color LerpLin(Color a, Color b, double t) => Color.Lerp(a.linear, b.linear, (float)t).gamma;
        static double Lerp(double a, double b, double t) => a + (b - a) * t;

        /// <summary>env.js lookAt(track, s): the biome look at progress s, blended across biome borders.</summary>
        public static EnvLook LookAt(Track track, double s, EnvLook o = null)
        {
            var (a, b, t) = track.BiomeBlend(s);
            LookDef A = track.m.biomes[a].look, B = track.m.biomes[b].look;
            o = o ?? new EnvLook();
            Color C(int x, int y) => LerpLin(MatDef.Hex(x), MatDef.Hex(y), t);
            o.skyTop = C(A.skyTop, B.skyTop); o.skyHorizon = C(A.skyHorizon, B.skyHorizon); o.fog = C(A.fog, B.fog);
            o.sun = C(A.sun, B.sun); o.hemiSky = C(A.hemiSky, B.hemiSky); o.hemiGround = C(A.hemiGround, B.hemiGround);
            o.grass = C(A.grass, B.grass); o.dirt = C(A.dirt, B.dirt); o.rock = C(A.rock, B.rock);
            o.fogDensity = Lerp(A.fogDensity, B.fogDensity, t); o.sunIntensity = Lerp(A.sunIntensity, B.sunIntensity, t);
            o.sunElev = Lerp(A.sunElev, B.sunElev, t); o.sunAzim = Lerp(A.sunAzim, B.sunAzim, t);
            o.hemiIntensity = Lerp(A.hemiIntensity, B.hemiIntensity, t);
            o.clouds = Lerp(A.clouds, B.clouds, t); o.cloudDark = Lerp(A.cloudDark, B.cloudDark, t);
            o.wind = Lerp(A.wind, B.wind, t); o.birds = Lerp(A.birds, B.birds, t); o.warmth = Lerp(A.warmth, B.warmth, t);
            double W(string w) => Lerp(A.weather == w ? 1 : 0, B.weather == w ? 1 : 0, t);
            o.snow = W("snow"); o.rain = W("rain"); o.storm = W("storm"); o.dust = W("dust");
            if (o.storm > 0) o.rain = Math.Max(o.rain, o.storm * 0.7);
            return o;
        }

        readonly List<double[]> pendingThunder = new List<double[]>();
        static readonly int P_TOP = Shader.PropertyToID("_Top"), P_HOR = Shader.PropertyToID("_Horizon"), P_SUNDIR = Shader.PropertyToID("_SunDir"),
            P_SUN = Shader.PropertyToID("_Sun"), P_CLOUD = Shader.PropertyToID("_Cloud"), P_CDARK = Shader.PropertyToID("_CloudDark"),
            P_TIME = Shader.PropertyToID("_SkyTime"), P_FLASH = Shader.PropertyToID("_Flash");

        /// <param name="s">progress on the track</param>
        /// <param name="focus">game-space position the camera looks at (the player's car)</param>
        public void Update(float dt, Track track, double s, Camera camera, Vector3 focus, double inTunnel = 0)
        {
            time += dt;
            var L = look = LookAt(track, s, look);
            tunnel = Lerp(tunnel, inTunnel, 1 - Math.Exp(-dt * 4));
            float tun = (float)tunnel;
            double el = L.sunElev * Math.PI / 180, az = L.sunAzim * Math.PI / 180;
            var dir = G.V(Math.Cos(el) * Math.Sin(az), Math.Sin(el), Math.Cos(el) * Math.Cos(az));
            sunDir = dir;
            if (skyMat)
            {
                skyMat.SetColor(P_TOP, L.skyTop); skyMat.SetColor(P_HOR, L.skyHorizon); skyMat.SetVector(P_SUNDIR, dir); skyMat.SetColor(P_SUN, L.sun);
                skyMat.SetFloat(P_CLOUD, (float)L.clouds); skyMat.SetFloat(P_CDARK, (float)L.cloudDark); skyMat.SetFloat(P_TIME, (float)(time * (0.6 + L.wind)));
            }
            // lightning in storms
            if (L.storm > 0.3 && Random.value < dt * 0.05 * L.storm)
            {
                flash = 1;
                var ev = new EnvEvent { type = "thunder", delay = 0.6 + Random.value * 2.5, power = 0.5 + Random.value * 0.5 };
                events.Add(ev);
                if (autoThunder) pendingThunder.Add(new[] { time + ev.delay, ev.power });
            }
            for (int i = pendingThunder.Count - 1; i >= 0; i--)
                if (time >= pendingThunder[i][0]) { Downfall.Audio.AudioSys.A?.Thunder((float)pendingThunder[i][1]); pendingThunder.RemoveAt(i); }
            flash = Math.Max(0, flash - dt * 5);
            float fl = (float)(flash > 0.5 ? flash : flash * 0.3);
            if (skyMat) skyMat.SetFloat(P_FLASH, fl * 0.35f);
            // fog
            RenderSettings.fogColor = Color.Lerp(L.fog.linear, MatDef.Hex(0x1a1c1e).linear, tun * 0.85f).gamma;
            RenderSettings.fogDensity = (float)(L.fogDensity * (1 + tun * 0.6));
            // lights
            sun.color = L.sun;
            sun.intensity = (float)(L.sunIntensity * (1 - tun * 0.92) * (1 - L.clouds * 0.25)) * lightScale;
            float hi = (float)(L.hemiIntensity * 1.7 * (1 - tun * 0.75) + fl * 1.5) * lightScale;
            RenderSettings.ambientSkyColor = (L.hemiSky.linear * hi).gamma;
            RenderSettings.ambientEquatorColor = (Color.Lerp(L.hemiSky.linear, L.hemiGround.linear, 0.5f) * hi).gamma;
            RenderSettings.ambientGroundColor = (L.hemiGround.linear * hi).gamma;
            sun.transform.rotation = Quaternion.LookRotation(-Coord.ToUnity(dir), Vector3.up);
            Vector3 camU = camera ? camera.transform.position : Coord.ToUnity(focus);
            Vector3 camG = Coord.FromUnity(camU);
            // ridges + floor follow the camera
            ridges.transform.position = new Vector3(camU.x, camU.y - 380, camU.z);
            for (int i = 0; i < 3; i++)
            {
                var m = ridgeMats[i];
                m.SetColor("_Haze", Color.Lerp(L.skyHorizon.linear, L.fog.linear, 0.4f).gamma);
                var bse = Color.Lerp(L.rock.linear * 0.55f, L.hemiGround.linear, 0.25f).gamma;
                m.SetColor("_Base", bse); m.SetColor("_BaseColor", bse);
                m.SetFloat("_SnowLine", (float)((L.snow > 0.5 ? 120 : 380) + i * 140 - L.warmth * 200));
            }
            floor.transform.position = new Vector3(camU.x, (float)(track.RoadY(s) - 240), camU.z);
            var fc = Color.Lerp(L.grass.linear * 0.55f, L.fog.linear, 0.3f).gamma;
            floorMat.SetColor("_BaseColor", fc); floorMat.color = fc;
            UpdateWeather(dt, camera, camU, L, tun);
            UpdateBirds(dt, L, focus);
            // environment reflections, refreshed when the look changes enough
            Color32 k1 = L.skyTop, k2 = L.skyHorizon;
            long key = ((long)k1.r << 40) | ((long)k1.g << 32) | ((long)k1.b << 24) | ((long)k2.r << 16) | ((long)k2.g << 8) | k2.b;
            key = key * 31 + (long)Math.Round(L.sunElev / 5);
            if (key != lastEnvKey && time - envTime > 2)
            {
                lastEnvKey = key; envTime = time;
                try { DynamicGI.UpdateEnvironment(); } catch (Exception) { }
            }
        }

        // ------------------------------------------------------------------ weather
        sealed class Pool
        {
            public Vector3[] p; public Mesh mesh; public Vector3[] verts; public Color[] cols; public Material mat; public Color col;
            public bool lines, visible; public float opacity = -1, size;
            public GameObject go;
        }
        Pool wSnow, wRain, wDust;
        const float BOX = 60;

        Pool MakePool(int count, float size, Color col, bool lines)
        {
            var P = new Pool { p = new Vector3[count], size = size, col = col, lines = lines };
            for (int i = 0; i < count; i++) P.p[i] = new Vector3((Random.value - 0.5f) * BOX, (Random.value - 0.5f) * BOX, (Random.value - 0.5f) * BOX);
            int vpp = lines ? 2 : 4;
            P.verts = new Vector3[count * vpp]; P.cols = new Color[count * vpp];
            var uv = new Vector2[count * vpp];
            var idx = new int[lines ? count * 2 : count * 6];
            for (int i = 0; i < count; i++)
            {
                if (lines) { idx[i * 2] = i * 2; idx[i * 2 + 1] = i * 2 + 1; uv[i * 2] = uv[i * 2 + 1] = new Vector2(0.5f, 0.5f); }
                else
                {
                    int b = i * 4;
                    idx[i * 6] = b; idx[i * 6 + 1] = b + 1; idx[i * 6 + 2] = b + 2; idx[i * 6 + 3] = b; idx[i * 6 + 4] = b + 2; idx[i * 6 + 5] = b + 3;
                    uv[b] = new Vector2(0, 0); uv[b + 1] = new Vector2(0, 1); uv[b + 2] = new Vector2(1, 1); uv[b + 3] = new Vector2(1, 0);
                }
            }
            P.mesh = new Mesh { name = lines ? "rain" : "flakes" };
            P.mesh.MarkDynamic();
            if (P.verts.Length > 65535) P.mesh.indexFormat = IndexFormat.UInt32;
            P.mesh.vertices = P.verts; P.mesh.uv = uv; P.mesh.colors = P.cols;
            P.mesh.SetIndices(idx, lines ? MeshTopology.Lines : MeshTopology.Triangles, 0);
            P.mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 1e5f);
            P.mat = FxMats.Make("Downfall/Particle", FxMats.SoftSprite());
            P.mat.SetFloat("_Src", (float)BlendMode.SrcAlpha);
            P.mat.SetFloat("_Dst", (float)BlendMode.OneMinusSrcAlpha);
            P.mat.SetFloat("_Fog", 1);
            P.mat.renderQueue = 3001;
            P.go = new GameObject(lines ? "rain" : "weather");
            P.go.transform.SetParent(root.transform, false);
            P.go.AddComponent<MeshFilter>().sharedMesh = P.mesh;
            var r = P.go.AddComponent<MeshRenderer>();
            r.sharedMaterial = P.mat; r.shadowCastingMode = ShadowCastingMode.Off; r.receiveShadows = false;
            P.go.SetActive(false);
            return P;
        }

        void MakeWeather(string q)
        {
            int n = q == "low" ? 700 : q == "high" ? 2600 : 1600;
            wSnow = MakePool(n, 0.22f, Color.white, false);
            wDust = MakePool(Mathf.RoundToInt(n * 0.5f), 0.7f, MatDef.Hex(0xc8a27a), false);
            wRain = MakePool(Mathf.RoundToInt(n * 0.8f), 0, MatDef.Hex(0xaab4c0), true);
        }

        void UpdateWeather(float dt, Camera camera, Vector3 c, EnvLook L, float tun)
        {
            double snowAmt = L.snow > 0.5 ? (L.snow > 0.9 ? 0.85 : 0.4) * (1 - tun) : 0;
            Vis(wSnow, (float)snowAmt, 0.9f);
            Vis(wRain, (float)(L.rain * (1 - tun)), 0.35f);
            Vis(wDust, (float)(L.dust * (1 - tun) + L.warmth * 0.15 * (1 - tun)), 0.3f);
            float wind = (float)L.wind;
            Vector3 right = camera ? camera.transform.right : Vector3.right, up = camera ? camera.transform.up : Vector3.up;
            float k = 0.5f * Mathf.Tan((camera ? camera.fieldOfView : 60) * 0.5f * Mathf.Deg2Rad);
            Step(wSnow, dt, c, -2.2f, wind * 3, 1.2f, right, up, k);
            Step(wRain, dt, c, -22f, wind * 4, 0, right, up, k);
            Step(wDust, dt, c, 0.2f, wind * 9, 2, right, up, k);
        }

        static void Vis(Pool p, float amt, float baseOp)
        {
            bool v = amt > 0.02f;
            if (v != p.visible) { p.visible = v; p.go.SetActive(v); }
            float op = baseOp * amt;
            if (v && Math.Abs(op - p.opacity) > 0.005f)
            {
                p.opacity = op;
                var cc = p.col; cc.a = op;
                for (int i = 0; i < p.cols.Length; i++) p.cols[i] = cc;
                p.mesh.colors = p.cols;
            }
        }

        // game x wind maps to Unity -x (mirrored)
        void Step(Pool P, float dt, Vector3 c, float vy, float vx, float jitter, Vector3 right, Vector3 up, float k)
        {
            if (!P.visible) return;
            float half = BOX / 2;
            float ux = -vx;
            var a = P.p;
            for (int i = 0; i < a.Length; i++)
            {
                int ii = P.lines ? i * 6 : i * 3; // the JS jitter phase uses the float-array index
                float x = a[i].x + ux * dt + (jitter != 0 ? -Mathf.Sin((float)time * 1.3f + ii) * jitter * dt : 0), y = a[i].y + vy * dt, z = a[i].z + vx * 0.4f * dt;
                float rx = x - c.x, ry = y - c.y, rz = z - c.z;
                if (rx > half) x -= BOX; else if (rx < -half) x += BOX;
                if (ry < -half) y += BOX; else if (ry > half) y -= BOX;
                if (rz > half) z -= BOX; else if (rz < -half) z += BOX;
                a[i] = new Vector3(x, y, z);
                if (P.lines) { P.verts[i * 2] = a[i]; P.verts[i * 2 + 1] = new Vector3(x + ux * 0.03f, y - 0.7f, z); }
                else
                {
                    float hs = P.size * k;
                    Vector3 r = right * hs, u = up * hs;
                    int b = i * 4;
                    P.verts[b] = a[i] - r - u; P.verts[b + 1] = a[i] - r + u; P.verts[b + 2] = a[i] + r + u; P.verts[b + 3] = a[i] + r - u;
                }
            }
            P.mesh.vertices = P.verts;
        }

        // ------------------------------------------------------------------ birds
        sealed class Bird { public double a, r, h, sp, ph; public int flock; }
        Mesh birdMesh; Material birdMat;
        readonly Bird[] birds = new Bird[16];
        Vector3 birdCenter;
        bool birdsVisible;

        void MakeBirds()
        {
            var g = new Geo();
            float[] p = { 0, 0, 0.3f, -0.9f, 0.1f, -0.2f, 0, 0, -0.1f, 0, 0, 0.3f, 0.9f, 0.1f, -0.2f, 0, 0, -0.1f };
            for (int i = 0; i < 6; i++) g.Add(new Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), Vector3.up, new Vector2(0.5f, 0.5f));
            g.Tri(0, 1, 2); g.Tri(3, 4, 5);
            g.ComputeNormals();
            birdMesh = g.ToMesh("bird");
            var cols = new Color[6]; for (int i = 0; i < 6; i++) cols[i] = new Color(0.102f, 0.102f, 0.11f, 1);
            birdMesh.colors = cols;
            birdMat = WorldMats.Unlit("bird", new Color(0.102f, 0.102f, 0.11f, 1), false);
            for (int i = 0; i < 16; i++) birds[i] = new Bird { a = Random.value * 6.28, r = 30 + Random.value * 40, h = 25 + Random.value * 25, sp = 0.15 + Random.value * 0.1, ph = Random.value * 6, flock = i < 9 ? 0 : 1 };
        }

        void UpdateBirds(float dt, EnvLook L, Vector3 focus)
        {
            birdsVisible = L.birds > 0.3 && tunnel < 0.5;
            if (!birdsVisible) return;
            double cx = focus.x + 60, cz = focus.z + 140;
            birdCenter.x = (float)Lerp(birdCenter.x, cx, 1 - Math.Exp(-dt * 0.05));
            birdCenter.z = (float)Lerp(birdCenter.z, cz, 1 - Math.Exp(-dt * 0.05));
            if (Math.Abs(birdCenter.x - cx) > 400) birdCenter = G.V(cx, 0, cz);
            foreach (var b in birds)
            {
                b.a += b.sp * dt;
                double fx = b.flock != 0 ? -80 : 0;
                double x = birdCenter.x + fx + Math.Cos(b.a) * b.r, z = birdCenter.z + Math.Sin(b.a) * b.r, y = focus.y + b.h + Math.Sin(time * 0.5 + b.ph) * 3;
                double flap = Math.Sin(time * 9 + b.ph) * 0.6;
                var m = G.TRS(x, y, z, G.Euler(0, -b.a, flap), 1.2, 1 + flap * 0.4, 1.2);
                Graphics.DrawMesh(birdMesh, G.ToUnity(m), birdMat, 0, null, 0, null, ShadowCastingMode.Off, false);
            }
        }

        public void Dispose()
        {
            if (RenderSettings.skybox == skyMat) RenderSettings.skybox = null;
            if (root) UnityEngine.Object.Destroy(root);
        }
    }
}
