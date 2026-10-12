// Analogue/digital hybrid speedometer (port of speedo.js): RPM arc with redline,
// big km/h readout, gear, turbo/boost meter and warning lamps. Drawn with Vec2D + Text.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Downfall
{
    public sealed class Speedo
    {
        public const float W = 240, H = 172;
        public readonly RectTransform rt;
        readonly Vec2D g;
        readonly Text speed, units, gear, gearLab, turbo;
        readonly List<Text> ticks = new List<Text>();
        readonly Text[] lamps = new Text[4];
        static readonly string[] lampNames = { "FUEL", "ENGINE", "BRAKES", "TEMP" };
        float rpmD;

        public Speedo(Transform parent)
        {
            rt = K.Node(parent, "speedo");
            rt.sizeDelta = new Vector2(W, H);
            g = rt.gameObject.AddComponent<Vec2D>();
            g.design = new Vector2(W, H);
            g.raycastTarget = false;
            speed = Lab(65, 700, Pal.ink, TextAnchor.MiddleCenter);
            units = Lab(10, 600, Pal.A(Pal.ink, .5f), TextAnchor.MiddleCenter);
            gear = Lab(18, 700, Pal.ink, TextAnchor.MiddleCenter);
            gearLab = Lab(9, 600, Pal.A(Pal.ink, .45f), TextAnchor.MiddleCenter); gearLab.text = "GEAR";
            turbo = Lab(9, 600, Pal.A(Pal.ink, .45f), TextAnchor.MiddleLeft); turbo.text = "TURBO";
            for (int i = 0; i < 4; i++) { lamps[i] = Lab(9, 700, Pal.A(Pal.ink, .12f), TextAnchor.MiddleCenter); lamps[i].text = lampNames[i]; }
        }

        Text Lab(int size, int w, Color c, TextAnchor a)
        {
            var t = K.Cond(rt, "", size, c, w, 0, a);
            t.RT().sizeDelta = new Vector2(160, size * 1.5f);
            return t;
        }
        // y is the canvas baseline (alphabetic) or the middle
        static void Put(Text t, float x, float y, bool baseline)
        {
            var r = t.RT();
            r.anchorMin = r.anchorMax = new Vector2(0, 1);
            r.pivot = new Vector2(t.alignment == TextAnchor.MiddleLeft ? 0 : .5f, .5f);
            r.anchoredPosition = new Vector2(x, -(baseline ? y - t.fontSize * 0.36f : y));
        }

        public void Resize() { }

        public void Draw(SpeedoData d)
        {
            g.Clear();
            float cx = W / 2, cy = H * 0.8f, R = Mathf.Min(W * 0.44f, H * 0.72f);
            float a0 = Mathf.PI * 0.92f, a1 = Mathf.PI * 2.08f;
            float redline = (float)System.Math.Max(1, d.redline);
            rpmD += ((float)d.rpm - rpmD) * 0.35f;
            float frac = Mathf.Min(1.08f, rpmD / redline);
            g.Arc(cx, cy, R, a0, a1, 7, new Color(0, 0, 0, .45f));
            int maxK = Mathf.CeilToInt(redline / 1000);
            int nt = 0;
            for (int i = 0; i <= maxK * 2; i++)
            {
                float f = (i * 500f) / (maxK * 1000f);
                float a = a0 + (a1 - a0) * f;
                bool big = i % 2 == 0;
                float r0 = R - (big ? 13 : 8), r1 = R - 4;
                var col = i * 500 >= redline * 0.92f ? Pal.A(Pal.red, .9f) : Pal.A(Pal.ink, .55f);
                g.Line(cx + Mathf.Cos(a) * r0, cy + Mathf.Sin(a) * r0, cx + Mathf.Cos(a) * r1, cy + Mathf.Sin(a) * r1, big ? 2 : 1, col);
                if (big)
                {
                    if (nt >= ticks.Count) ticks.Add(Lab(10, 600, Pal.A(Pal.ink, .5f), TextAnchor.MiddleCenter));
                    var t = ticks[nt++];
                    t.gameObject.SetActive(true);
                    string s = (i / 2).ToString();
                    if (t.text != s) t.text = s;
                    Put(t, cx + Mathf.Cos(a) * (R - 22), cy + Mathf.Sin(a) * (R - 22), false);
                }
            }
            for (int i = nt; i < ticks.Count; i++) ticks[i].gameObject.SetActive(false);
            float redA = a0 + (a1 - a0) * Mathf.Min(1, (redline * 0.92f) / (maxK * 1000f));
            g.Arc(cx, cy, R + 4, redA, a1, 3, Pal.A(Pal.red, .85f));
            float fa = a0 + (a1 - a0) * Mathf.Min(1, rpmD / (maxK * 1000f));
            if (fa > a0 + 0.002f) g.Arc(cx, cy, R, a0, fa, 7, frac > 0.92f ? Pal.red : Pal.ink);

            string sp = Mathf.RoundToInt((float)d.speed).ToString();
            if (speed.text != sp) speed.text = sp;
            speed.fontSize = Mathf.RoundToInt(R * 0.62f);
            Put(speed, cx, cy - R * 0.12f, true);
            if (units.text != d.units) units.text = d.units;
            Put(units, cx, cy + 4, true);
            if (gear.text != d.gear) gear.text = d.gear;
            gear.color = d.gear == "R" ? Pal.amber : Pal.ink;
            Put(gear, cx + R * 0.72f, cy - 2, true);
            Put(gearLab, cx + R * 0.72f, cy + 9, true);

            bool hasBoost = d.boostCap > 0;
            turbo.gameObject.SetActive(hasBoost);
            if (hasBoost)
            {
                float bx = cx - R * 0.95f, by = cy - 6, bw = 34;
                Put(turbo, bx, by + 15, true);
                g.Rect(bx, by, bw, 5, new Color(0, 0, 0, .45f));
                g.Rect(bx, by, bw * Mathf.Clamp01((float)d.boostTank), 5, d.overboost ? Pal.amber : Pal.A(Pal.ink, .85f));
                g.Rect(bx, by - 5, bw * Mathf.Clamp01((float)d.boost), 2, Pal.A(Pal.amber, .8f));
            }
            bool[] on = { d.lowFuel, d.engineWarn, d.brakeWarn, d.hot };
            float lx = cx - 72;
            bool blink = Mathf.FloorToInt(Time.unscaledTime * 1000 / 350f) % 2 == 0;
            for (int i = 0; i < 4; i++)
            {
                lamps[i].color = on[i] ? (blink ? Pal.red : Pal.A(Pal.red, .35f)) : Pal.A(Pal.ink, .12f);
                Put(lamps[i], lx, cy + 20, true);
                lx += 48;
            }
            g.Commit();
        }
    }
}
