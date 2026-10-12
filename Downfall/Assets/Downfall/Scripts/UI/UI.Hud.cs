// HUD (distance, cash, fuel/condition gauges, speedo, notices, feed, hints), race HUD
// (position, lap, time, board, minimap, turbo bar, name tags) and the touch controls.
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.UI;

namespace Downfall
{
    public sealed partial class UI
    {
        sealed class Gauge { public RectTransform root; public Text val; public Image fill; public bool warn; public Text[] dmg; public string[] keys; public int[] state; }
        Text hDist, hBest, hRegion, hMoney, hGain, hFps, hNotice;
        CanvasGroup hBody, hNoticeCg;
        RectTransform hTL, hTR, hFeed, hHint, hBottom, hTags, hNoticeRt;
        Gauge gFuel, gHp;
        UiButton pauseBtn;
        double hudBest, cashShown;
        bool distRec;
        int noticeT, hintT;
        CanvasGroup hintCg;
        // race
        RectTransform rh, rBoard, rNitro;
        Text rPos, rN, rLap, rTime, rBest, rNitroText;
        Image rNitroFill;
        RawImage rNitroGrad;
        Image rNitroGlow;
        Vec2D rMapBg, rMapDots;
        string boardKey = "";
        Func<double, double, Vector2> mapTf;
        Texture2D nitroBlue, nitroReady, nitroOn;

        void BuildHud()
        {
            var s = NewScreen("hud");
            var body = K.Node(s.rt, "body").Fill();
            hBody = body.gameObject.AddComponent<CanvasGroup>();
            // top left: distance / best / region
            hTL = Box(body, 0, 1, PAD, -PAD, 500, 120, "tl");
            K.V(hTL, 0, 0, 0, 0, 0, TextAnchor.UpperLeft, false);
            hDist = K.Cond(hTL, "0.00", 46, Pal.ink, 700);
            hDist.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .45f);
            K.Spacer(hTL, -1, 4);
            hBest = K.Cond(hTL, "BEST", 13, Pal.ink2, 600, .09f);
            K.Spacer(hTL, -1, 10);
            hRegion = K.Cond(hTL, "", 11, Pal.ink3, 500, .1f);
            // top right: cash
            hTR = Box(body, 1, 1, -PAD, -PAD, 400, 80, "tr");
            K.V(hTR, 3, 0, 0, 0, 0, TextAnchor.UpperRight, false);
            K.Cond(hTR, "CASH", 10.5f, Pal.ink3, 500, .1f, TextAnchor.UpperRight);
            hMoney = K.Cond(hTR, "$0", 30, Pal.ink, 700, 0, TextAnchor.UpperRight);
            hMoney.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .45f);
            hGain = K.Cond(hTR, "", 14, Pal.green, 600, .032f, TextAnchor.UpperRight);
            // pause (touch only)
            var pimg = K.Img(body, Pal.bg2, Sprites.Round, "pausebtn", true);
            pimg.RT().At(1, 1, -PAD, -PAD - 74, 40, 40);
            K.Border(pimg.transform, Pal.line2);
            K.Img(pimg.transform, Pal.ink, Sprites.White, "a").RT().At(.5f, .5f, -3.5f, 0, 3, 14);
            K.Img(pimg.transform, Pal.ink, Sprites.White, "b").RT().At(.5f, .5f, 3.5f, 0, 3, 14);
            pauseBtn = pimg.gameObject.AddComponent<UiButton>(); pauseBtn.targetGraphic = pimg; pauseBtn.transition = Selectable.Transition.None;
            pauseBtn.navigation = new Navigation { mode = Navigation.Mode.None };
            pauseBtn.onClick.AddListener(() => Emit("pause"));
            // feed
            hFeed = Box(body, 1, 1, -PAD, -PAD - 92, 500, 300, "feed");
            K.V(hFeed, 4, 0, 0, 0, 0, TextAnchor.UpperRight, false);
            // hint
            var hint = K.Img(body, Pal.bg2, Sprites.Round, "hint");
            hHint = hint.RT(); hHint.At(.5f, 0, 0, 190, 0, 0);
            K.Border(hint.transform, Pal.line);
            K.H(hint, 0, 14, 14, 8, 8, TextAnchor.MiddleCenter); K.Fit(hint, true, true);
            hintCg = hint.gameObject.AddComponent<CanvasGroup>(); hintCg.alpha = 0;
            // bottom: fuel · speedo · condition
            hBottom = Box(body, .5f, 0, 0, 14, 600, 172, "bottom");
            K.H(hBottom, 18, 0, 0, 0, 0, TextAnchor.LowerCenter); K.Fit(hBottom, true, true);
            gFuel = BuildGauge(hBottom, "FUEL", "0 L", new[] { "engine", "tires" }, new[] { "ENGINE", "TYRES" });
            speedo = new Speedo(hBottom);
            K.LE(speedo.rt, Speedo.W, Speedo.H);
            gHp = BuildGauge(hBottom, "CONDITION", "100%", new[] { "susp", "brakes" }, new[] { "SUSP", "BRAKES" });
            hFps = K.Cond(body, "", 11, Pal.ink3, 500);
            hFps.RT().At(0, 0, PAD, 8, 200, 16);
            // race HUD
            rh = Box(body, 0, 1, PAD, -PAD, 500, 70, "rh");
            K.H(rh, 12, 0, 0, 0, 0, TextAnchor.MiddleLeft); K.Fit(rh, true, true);
            var rpos = K.Row(rh, 2, "rpos", TextAnchor.LowerLeft);
            rPos = K.Cond(rpos, "1", 54, Color.white, 700);
            rPos.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .5f);
            rN = K.Cond(rpos, "/8", 22, Pal.ink2, 700);
            var rinfo = K.Col(rh, 2, "rinfo");
            rLap = K.Cond(rinfo, "LAP 1/3", 14, Pal.ink2, 600);
            rTime = K.Cond(rinfo, "0:00.000", 20, Color.white, 600);
            rBest = K.Cond(rinfo, "BEST —", 14, Pal.ink2, 600);
            rBoard = Box(body, 1, 1, -PAD, -PAD - 44, 200, 300, "rboard");
            K.V(rBoard, 2);
            var map = Box(body, 0, 0, PAD, PAD, 150, 150, "rmap");
            rMapBg = K.Node(map, "bg").Fill().gameObject.AddComponent<Vec2D>(); rMapBg.design = new Vector2(200, 200); rMapBg.raycastTarget = false; rMapBg.color = new Color(1, 1, 1, .92f);
            rMapDots = K.Node(map, "dots").Fill().gameObject.AddComponent<Vec2D>(); rMapDots.design = new Vector2(200, 200); rMapDots.raycastTarget = false;
            var ni = K.Img(body, Pal.C(10, 11, 12, .6f), Sprites.Round, "rnitro");
            rNitro = ni.RT(); rNitro.At(1, 0, -PAD, PAD + 30, 210, 16);
            rNitroGlow = K.Img(ni.transform, Pal.C(120, 200, 255, .6f), Sprites.Round, "glow"); rNitroGlow.RT().Fill(-6, -6, -6, -6); rNitroGlow.transform.SetAsFirstSibling(); rNitroGlow.color = Pal.C(120, 200, 255, .35f);
            var nclip = K.Node(ni.transform, "clip").Fill(); nclip.gameObject.AddComponent<RectMask2D>();
            rNitroFill = K.Img(nclip, Color.white, Sprites.White, "fill");
            rNitroFill.RT().anchorMin = Vector2.zero; rNitroFill.RT().anchorMax = new Vector2(0, 1); rNitroFill.RT().offsetMin = rNitroFill.RT().offsetMax = Vector2.zero;
            rNitroGrad = K.Node(rNitroFill.transform, "grad").Fill().gameObject.AddComponent<RawImage>(); rNitroGrad.raycastTarget = false;
            nitroBlue = Tex.Gradient(true, (0, Pal.C(42, 106, 208)), (1, Pal.C(106, 184, 255)));
            nitroReady = Tex.Gradient(true, (0, Pal.C(42, 138, 208)), (1, Pal.C(143, 224, 255)));
            nitroOn = Tex.Gradient(true, (0, Pal.C(255, 90, 26)), (1, Pal.C(255, 208, 64)));
            rNitroGrad.texture = nitroBlue;
            rNitroText = K.Cond(ni.transform, "TURBO  <color=#ebe6dab3>SHIFT</color>", 11, Pal.ink2, 600, 0, TextAnchor.MiddleCenter); rNitroText.RT().Fill();
            hTags = K.Node(body, "tags").Fill();
            // notice stays visible during the race intro
            var nl = K.Node(s.rt, "notice").Fill();
            hNotice = K.Cond(nl, "", 32, Pal.ink, 700, .096f, TextAnchor.UpperCenter);
            hNoticeRt = hNotice.RT(); hNoticeRt.At(.5f, 1, 0, -1080 * 0.21f, 1400, 80);
            hNotice.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .5f);
            hNoticeCg = hNotice.gameObject.AddComponent<CanvasGroup>(); hNoticeCg.alpha = 0;
            ApplyRaceMode();
        }

        Gauge BuildGauge(Transform p, string label, string val, string[] keys, string[] names)
        {
            var g = new Gauge { keys = keys, dmg = new Text[keys.Length], state = new int[keys.Length] };
            g.root = K.Col(p, 0, "gauge");
            K.LE(g.root, 150, -1);
            var lab = K.Row(g.root, 0);
            var l = K.Cond(lab, label, 10.5f, Pal.ink2, 600, .09f); K.LE(l, -1, -1, 1);
            l.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .6f);
            g.val = K.Cond(lab, val, 10.5f, Pal.ink, 600, .019f, TextAnchor.MiddleRight);
            K.Spacer(g.root, -1, 5);
            var track = K.Img(g.root, new Color(0, 0, 0, .45f), Sprites.White, "track"); K.LE(track, -1, 5);
            K.Border(track.transform, Pal.line);
            g.fill = Fill(track.transform, 1, Pal.ink);
            K.Spacer(g.root, -1, 10);
            var dr = K.Row(g.root, 4, "dmg");
            dr.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = true;
            for (int i = 0; i < keys.Length; i++)
            {
                var chip = K.Img(dr, new Color(0, 0, 0, .35f), Sprites.White, "d"); K.LE(chip, -1, 17, 1);
                K.Border(chip.transform, Pal.line);
                var t = K.Cond(chip.transform, names[i], 9, Pal.ink3, 600, .051f, TextAnchor.MiddleCenter); t.RT().Fill();
                g.dmg[i] = t;
            }
            return g;
        }

        void ApplyRaceMode()
        {
            if (rh == null) return;
            rh.gameObject.SetActive(raceMode); rBoard.gameObject.SetActive(raceMode); rMapBg.transform.parent.gameObject.SetActive(raceMode); rNitro.gameObject.SetActive(raceMode);
            void Vis(Component c, bool v) { var cg = c.GetComponent<CanvasGroup>(); if (!cg) cg = c.gameObject.AddComponent<CanvasGroup>(); cg.alpha = v ? 1 : 0; }
            Vis(hTL, !raceMode); Vis(hTR, !raceMode); Vis(gFuel.root, !raceMode); Vis(gHp.root, !raceMode);
        }

        public void HudInit(double best, double cash)
        {
            hudBest = best;
            hBest.text = "BEST  <color=" + Pal.Hex(Pal.ink) + ">" + U.FmtKm(best) + " KM</color>";
            distRec = false; hDist.color = Pal.ink;
            cashShown = cash;
            hMoney.text = U.FmtMoney(cash);
            hGain.text = "";
            K.Clear(hFeed);
            hBottom.localScale = Vector3.one * (touchMode ? 0.82f : 1);
        }

        public void Hud(HudData d)
        {
            hDist.text = U.FmtKm(d.dist) + "<size=21><color=" + Pal.Hex(Pal.ink2) + ">  KM</color></size>";
            if (d.record != distRec) { distRec = d.record; var from = hDist.color; var to = d.record ? Pal.amber : Pal.ink; Animate(0.4f, k => hDist.color = Color.Lerp(from, to, k), null, hDist); }
            cashShown += (d.cash - cashShown) * 0.15;
            if (Math.Abs(d.cash - cashShown) < 1) cashShown = d.cash;
            hMoney.text = U.FmtMoney(cashShown);
            gFuel.val.text = d.fuel.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + " L";
            SetFill(gFuel.fill, (float)d.fuelFrac);
            gFuel.warn = d.fuelFrac < 0.15;
            gHp.val.text = Math.Max(0, Math.Round(d.hp * 100)) + "%";
            SetFill(gHp.fill, (float)Math.Max(0, d.hp));
            gHp.warn = d.hp < 0.25;
            foreach (var g in new[] { gFuel, gHp })
                for (int i = 0; i < g.keys.Length; i++)
                {
                    double v = g.keys[i] == "engine" ? d.parts.engine : g.keys[i] == "tires" ? d.parts.tires : g.keys[i] == "susp" ? d.parts.susp : d.parts.brakes;
                    g.state[i] = v < 0.25 ? 2 : v < 0.6 ? 1 : 0;
                }
            hRegion.text = d.region ?? "";
            hFps.text = d.fps ?? "";
        }
        public void HudSpeedo(SpeedoData d) { if (speedo != null && speedo.rt.gameObject.activeInHierarchy) speedo.Draw(d); }

        // per frame: warning blinks
        void HudFrame(float dt)
        {
            if (gFuel == null || !screens["hud"].rt.gameObject.activeSelf) return;
            float t = Time.unscaledTime;
            bool b6 = (t % 0.6f) < 0.3f, b7 = (t % 0.7f) < 0.35f;
            foreach (var g in new[] { gFuel, gHp })
            {
                g.fill.color = g.warn ? Pal.A(Pal.red, b6 ? 1 : .35f) : Pal.ink;
                g.val.color = g.warn ? Pal.red : Pal.ink;
                for (int i = 0; i < g.dmg.Length; i++)
                {
                    var tx = g.dmg[i];
                    var bg = tx.transform.parent.GetComponent<Image>();
                    var br = tx.transform.parent.Find("border").GetComponent<Image>();
                    int st = g.state[i];
                    float a = st == 2 && !b7 ? .35f : 1;
                    tx.color = st == 2 ? Pal.A(Color.white, a) : st == 1 ? Pal.amber : Pal.ink3;
                    bg.color = st == 2 ? Pal.A(Pal.red, a) : new Color(0, 0, 0, .35f);
                    br.color = st == 2 ? Pal.A(Pal.red, a) : st == 1 ? Pal.A(Pal.amber, .5f) : Pal.line;
                }
            }
            hBody.alpha = cineOn ? 0 : 1;
        }

        // ------------------------------------------------------------- race HUD
        // track outline from the Track arrays (JS coordinates px/pz, every 3rd/4th point like the web)
        public void RaceHudInit(int n, int laps, IList<double> px, IList<double> pz, int N, bool loop)
        {
            SetRaceMode(true);
            rN.text = "/" + n;
            K.Clear(hFeed);
            boardKey = "";
            double x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
            for (int j = 0; j < N; j += 4) { x0 = Math.Min(x0, px[j]); x1 = Math.Max(x1, px[j]); z0 = Math.Min(z0, pz[j]); z1 = Math.Max(z1, pz[j]); }
            double sc = 168 / Math.Max(Math.Max(x1 - x0, z1 - z0), 1);
            double ox = 100 - (x0 + x1) / 2 * sc, oz = 100 + (z0 + z1) / 2 * sc;
            mapTf = (x, z) => new Vector2((float)(ox + x * sc), (float)(oz - z * sc));
            rMapBg.Clear();
            var pts = new List<Vector2>();
            for (int j = 0; j < N; j += 3) pts.Add(mapTf(px[j], pz[j]));
            rMapBg.Stroke(pts, 9, new Color(0, 0, 0, .55f), loop);
            rMapBg.Stroke(pts, 4.5f, Pal.A(Pal.ink, .85f), loop);
            var s0 = mapTf(px[0], pz[0]);
            rMapBg.Rect(s0.x - 4, s0.y - 4, 8, 8, Pal.amber);
            rMapBg.Commit();
            rMapDots.Clear(); rMapDots.Commit();
        }
        public void RaceHud(RaceHudData d)
        {
            if (mapTf == null) return;
            rPos.text = d.pos.ToString();
            string w = Pal.Hex(Color.white);
            rLap.text = d.sprint ? $"SPRINT <color={w}>{Math.Round((d.progress ?? 0) * 100)}%</color>" : $"LAP <color={w}>{d.lap}/{d.laps}</color>";
            rTime.text = d.time;
            rBest.text = $"BEST <color={w}>{(d.sprint ? "—" : d.best)}</color>";
            var sb = new System.Text.StringBuilder();
            foreach (var b in d.board) sb.Append(b.name).Append(b.gap).Append('|');
            string key = sb.ToString();
            if (key != boardKey)
            {
                boardKey = key;
                K.Clear(rBoard);
                foreach (var b in d.board)
                {
                    var row = K.Img(rBoard, b.me ? Pal.A(Pal.amber, .85f) : Pal.C(10, 11, 12, .55f), Sprites.Round, "r");
                    K.H(row, 7, 8, 8, 3, 3);
                    var c = b.me ? Pal.dark : Pal.ink2;
                    var i = K.Cond(row.transform, b.pos.ToString(), 12.5f, c, 600, 0, TextAnchor.MiddleRight); K.LE(i, 18, -1);
                    var sw = K.Img(row.transform, Pal.Parse(b.color, Pal.amber), Sprites.White, "s"); K.LE(sw, 4, 12);
                    var n = K.Cond(row.transform, K.Esc(b.name), 12.5f, c, 600); K.LE(n, -1, -1, 1); n.horizontalOverflow = HorizontalWrapMode.Wrap; n.verticalOverflow = VerticalWrapMode.Truncate;
                    K.Cond(row.transform, b.gap, 12.5f, Pal.A(c, .8f), 600, 0, TextAnchor.MiddleRight);
                }
            }
            SetFill(rNitroFill, (float)(d.nitroOn ? 1 : d.nitro));
            bool ready = d.nitro >= 1 && !d.nitroOn;
            rNitroGrad.texture = d.nitroOn ? nitroOn : ready ? nitroReady : nitroBlue;
            rNitroGlow.enabled = ready;
            rNitroText.color = ready ? Color.white : Pal.ink2;
            rNitroText.text = touchMode ? "TURBO" : "TURBO  <color=#ebe6dab3>SHIFT</color>";
            rMapDots.Clear();
            for (int pass = 0; pass < 2; pass++)
                foreach (var p in d.dots)
                {
                    if (p.me != (pass == 1)) continue;
                    var v = mapTf(p.x, p.z);
                    float r = p.me ? 6 : 4.5f;
                    rMapDots.Disc(v, r + 1, Color.black);
                    rMapDots.Disc(v, r, p.me ? Color.white : Pal.Parse(p.color, Pal.amber));
                }
            rMapDots.Commit();
        }
        public void RaceHudEnd() { SetRaceMode(false); SetTags(null, null, false); }

        // name tags over the other drivers (online: real players)
        readonly List<(RectTransform rt, Text label, Text name, Image chip, Image edge)> tags = new List<(RectTransform, Text, Text, Image, Image)>();
        public void SetTags(Camera cam, IList<NameTag> list, bool show = true)
        {
            int used = 0;
            if (show && cam != null && list != null)
            {
                foreach (var e in list)
                {
                    var wp = e.pos + Vector3.up * 1.6f;
                    var vp = cam.WorldToViewportPoint(wp);
                    var cp = cam.transform.position;
                    float d = new Vector2(wp.x - cp.x, wp.z - cp.z).magnitude;
                    bool vis = vp.z > 0 && d < 260 && vp.x > -0.05f && vp.x < 1.05f && vp.y > -0.05f && vp.y < 1.05f;
                    if (!vis) continue;
                    if (used >= tags.Count)
                    {
                        var bg = K.Img(hTags, Pal.C(10, 11, 12, .62f), Sprites.White, "tag");
                        var r = bg.RT(); r.anchorMin = r.anchorMax = Vector2.zero; r.pivot = new Vector2(.5f, 0);
                        K.H(bg, 5, 7, 8, 3, 3); K.Fit(bg, true, true);
                        var edge = K.Img(bg.transform, Pal.amber, Sprites.White, "edge");
                        edge.RT().anchorMin = Vector2.zero; edge.RT().anchorMax = new Vector2(0, 1); edge.RT().pivot = new Vector2(0, .5f); edge.RT().sizeDelta = new Vector2(3, 0); edge.RT().anchoredPosition = Vector2.zero;
                        edge.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
                        var chip = K.Img(bg.transform, Pal.amber, Sprites.Round, "i"); K.H(chip, 0, 5, 5, 0, 0, TextAnchor.MiddleCenter);
                        var lab = K.Cond(chip.transform, "", 13, Pal.C(17, 17, 17), 700, 0, TextAnchor.MiddleCenter);
                        var nm = K.Cond(bg.transform, "", 13, Color.white, 600, .04f);
                        tags.Add((r, lab, nm, chip, edge));
                    }
                    var tg = tags[used++];
                    tg.rt.gameObject.SetActive(true);
                    var c = Pal.Parse(e.color, Pal.amber);
                    tg.chip.color = c; tg.edge.color = c;
                    tg.label.text = e.label ?? ""; tg.chip.gameObject.SetActive(!string.IsNullOrEmpty(e.label));
                    tg.name.text = K.Esc(e.name);
                    var size = hTags.rect.size;
                    tg.rt.anchoredPosition = new Vector2(vp.x * size.x, vp.y * size.y);
                    tg.rt.localScale = Vector3.one * Mathf.Clamp(40 / Mathf.Max(1, d), 0.65f, 1);
                }
            }
            for (int i = used; i < tags.Count; i++) tags[i].rt.gameObject.SetActive(false);
        }

        // ------------------------------------------------------------- notices
        public void Notice(string text, string sub = "", bool amber = false, float ms = 2200)
        {
            hNotice.text = K.Rich(text) + (string.IsNullOrEmpty(sub) ? "" : "\n<size=12><color=" + Pal.Hex(Pal.ink2) + ">" + K.Plain(sub) + "</color></size>");
            hNotice.color = amber ? Pal.amber : Pal.ink;
            float a0 = hNoticeCg.alpha;
            Animate(0.35f, k => { hNoticeCg.alpha = Mathf.Lerp(a0, 1, k); hNoticeRt.anchoredPosition = new Vector2(0, -1080 * 0.21f - 8 * (1 - Mathf.Max(a0, k))); }, null, hNoticeCg);
            Cancel(noticeT);
            noticeT = After(ms / 1000f, () => Animate(0.35f, k => { hNoticeCg.alpha = 1 - k; hNoticeRt.anchoredPosition = new Vector2(0, -1080 * 0.21f - 8 * k); }, null, hNoticeCg));
        }
        public void Feed(string text, double amount = 0)
        {
            var d = K.Img(hFeed, Pal.bg2, Sprites.White, "f");
            K.H(d, 0, 12, 10, 5, 5, TextAnchor.MiddleRight);
            var edge = K.Img(d.transform, Pal.amber, Sprites.White, "edge");
            edge.RT().anchorMin = Vector2.zero; edge.RT().anchorMax = new Vector2(0, 1); edge.RT().pivot = new Vector2(0, .5f); edge.RT().sizeDelta = new Vector2(2, 0); edge.RT().anchoredPosition = Vector2.zero;
            edge.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            K.Cond(d.transform, K.Rich(text) + (amount != 0 ? "  <color=" + Pal.Hex(Pal.green) + ">+" + U.FmtMoney(amount) + "</color>" : ""), 14, Pal.ink, 600, .058f, TextAnchor.MiddleRight);
            var cg = d.gameObject.AddComponent<CanvasGroup>();
            FeedAnim(cg, 2.6f);
            After(2.7f, () => { if (d) Destroy(d.gameObject); });
            int live = 0;
            for (int i = 0; i < hFeed.childCount; i++) if (hFeed.GetChild(i).gameObject.activeSelf) live++;
            for (int i = 0; live > 5 && i < hFeed.childCount; i++)
            {
                var c = hFeed.GetChild(i).gameObject;
                if (!c.activeSelf) continue;
                c.SetActive(false); Destroy(c); live--;
            }
        }
        static readonly Regex kbdRx = new Regex("<kbd>(.*?)</kbd>", RegexOptions.Compiled);
        public void Hint(string html, float ms = 4000)
        {
            K.Clear(hHint);
            var brd = K.Border(hHint, Pal.line);
            int i = 0;
            foreach (Match m in kbdRx.Matches(html ?? ""))
            {
                if (m.Index > i) K.Cond(hHint, K.Plain(html.Substring(i, m.Index - i)).Trim(), 13, Pal.ink2, 600, .083f);
                var kb = K.Node(hHint, "kbd"); K.H(kb, 0, 6, 6, 1, 1, TextAnchor.MiddleCenter);
                K.Border(kb, Pal.line2);
                K.Cond(kb, m.Groups[1].Value, 12, Pal.ink, 700, 0, TextAnchor.MiddleCenter);
                i = m.Index + m.Length;
            }
            if (i < (html ?? "").Length) K.Cond(hHint, K.Plain(html.Substring(i)).Trim(), 13, Pal.ink2, 600, .083f);
            var hl = hHint.GetComponent<HorizontalLayoutGroup>(); hl.spacing = 8;
            float a0 = hintCg.alpha;
            Animate(0.5f, k => hintCg.alpha = Mathf.Lerp(a0, 1, k), null, hintCg);
            Cancel(hintT);
            hintT = After(ms / 1000f, () => Animate(0.5f, k => hintCg.alpha = 1 - k, null, hintCg));
        }

        // ------------------------------------------------------------- touch controls
        void BuildTouch()
        {
            var s = NewScreen("touch");
            s.speed = 100;
            TouchButton(s.rt, 0, 18, 22, 86, 86, "‹", 34, v => { if (input != null) input.tLeft = v; });
            TouchButton(s.rt, 0, 116, 22, 86, 86, "›", 34, v => { if (input != null) input.tRight = v; });
            TouchButton(s.rt, 1, -18, 22, 86, 120, "GAS", 13, v => { if (input != null) input.tGas = v; });
            TouchButton(s.rt, 1, -116, 22, 86, 86, "BRAKE", 13, v => { if (input != null) input.tBrake = v; });
            TouchButton(s.rt, 1, -18, 154, 86, 52, "TURBO", 11, v => { if (input != null) input.tBoost = v; });
            TouchButton(s.rt, 1, -116, 120, 86, 52, "HANDBRAKE", 11, v => { if (input != null) input.tHand = v; });
        }
        void TouchButton(Transform p, float ax, float x, float y, float w, float h, string label, float size, Action<float> set)
        {
            var img = K.Img(p, Pal.C(13, 14, 15, .35f), Sprites.Round, "tbtn", true);
            img.RT().At(ax, 0, x, y, w, h);
            var br = K.Border(img.transform, Pal.line2);
            var t = K.Cond(img.transform, label, size, Pal.ink2, 700, .058f, TextAnchor.MiddleCenter); t.RT().Fill();
            var tb = img.gameObject.AddComponent<TouchBtn>();
            tb.bg = img; tb.border = br; tb.text = t;
            tb.set = v => { set(v); if (input != null) input.SetDevice("touch"); if (v > 0) { touchMode = true; SetTouch(true); } };
            tb.Paint();
        }
    }
}
