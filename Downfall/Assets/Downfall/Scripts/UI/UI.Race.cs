// Track select, race presentation (letterbox, event card, grid, podium), race results, online lobbies.
using System;
using System.Collections.Generic;
using UnityEngine;
using Downfall.Audio;
using UnityEngine.UI;

namespace Downfall
{
    public sealed partial class UI
    {
        // ------------------------------------------------------------- track select
        Text rsCash;
        RectTransform rsFilter, rsGrid, rsDetail;
        ScrollRect rsGridScroll;
        string rsFilterSel = "ALL";
        RaceSelectData rsLast;

        void BuildRaceSel()
        {
            var s = NewScreen("racesel");
            var bg = K.Node(s.rt, "bg").Fill().gameObject.AddComponent<RawImage>();
            bg.texture = Tex.Gradient(false, (0, Pal.C(10, 11, 12, .55f)), (1, Pal.C(10, 11, 12, .8f))); bg.raycastTarget = true;
            TopTitle(s.rt, "CHOOSE A TRACK", "20 TRACKS · 8 COUNTRIES");
            rsCash = CashBox(s.rt);
            var f = K.Panel(s.rt, "rs-filter", Pal.C(12, 13, 14, .72f), Pal.line);
            f.RT().At(0, 1, PAD, -PAD - 74, 600, 36);
            K.H(f, 2, 3, 3, 3, 3); K.Fit(f, true, true);
            rsFilter = f.RT();
            var gridBox = K.Node(s.rt, "rs-grid");
            gridBox.anchorMin = Vector2.zero; gridBox.anchorMax = Vector2.one;
            gridBox.offsetMin = new Vector2(PAD, PAD + 52); gridBox.offsetMax = new Vector2(-(PAD + 380 + 18), -(PAD + 124));
            rsGridScroll = K.Scroll(gridBox, out rsGrid);
            rsGridScroll.RT().Fill();
            DestroyImmediate(rsGrid.GetComponent<VerticalLayoutGroup>());
            var grid = rsGrid.gameObject.AddComponent<GridLayoutGroup>();
            grid.spacing = new Vector2(10, 10); grid.padding = new RectOffset(2, 2, 2, 2);
            var fit = rsGrid.gameObject.AddComponent<GridFit>(); fit.grid = grid; fit.viewport = rsGridScroll.viewport; fit.min = 168; fit.height = 152;
            var det = K.Panel(s.rt, "rs-detail");
            rsDetail = det.RT();
            rsDetail.anchorMin = new Vector2(1, 0); rsDetail.anchorMax = new Vector2(1, 1); rsDetail.pivot = new Vector2(1, .5f);
            rsDetail.offsetMin = new Vector2(-PAD - 380, PAD + 52); rsDetail.offsetMax = new Vector2(-PAD, -PAD - 74);
            K.V(det, 10, 20, 20, 18, 18);
            var back = Btn(s.rt, "‹ BACK", 0, () => Emit("raceBack"), "back");
            var br = back.RT(); br.anchorMin = br.anchorMax = br.pivot = Vector2.zero; br.anchoredPosition = new Vector2(PAD, PAD);
            K.Fit(back, true, true);
        }
        static void CcChip(Transform p, string cc, Color bg, Color fg)
        {
            var c = K.Img(p, bg, Sprites.Round, "cc"); K.H(c, 0, 5, 5, 1, 1, TextAnchor.MiddleCenter);
            K.Cond(c.transform, cc, 11, fg, 600, .08f, TextAnchor.MiddleCenter);
            K.LE(c, -1, -1, 0, 0);
        }

        public void RaceSelect(RaceSelectData d)
        {
            rsLast = d;
            var scope = screens["racesel"].rt;
            int fi = FocusIndex(scope);
            RaceSelectBody(d);
            Refocus(scope, fi);
        }
        void RaceSelectBody(RaceSelectData d)
        {
            rsCash.text = U.FmtMoney(d.cash);
            var countries = new List<string> { "ALL" };
            foreach (var m in d.maps) if (!countries.Contains(m.country)) countries.Add(m.country);
            if (!countries.Contains(rsFilterSel)) rsFilterSel = "ALL";
            K.Clear(rsFilter);
            foreach (var c in countries)
            {
                var cc = c;
                var b = Gtab(rsFilter, c, c, () => { rsFilterSel = cc; RaceSelect(rsLast); }, 14, 12, 7);
                b.on = c == rsFilterSel; b.Repaint();
            }
            var list = d.maps.FindAll(m => rsFilterSel == "ALL" || m.country == rsFilterSel);
            K.Clear(rsGrid);
            foreach (var m in list)
            {
                var map = m;
                var card = K.Img(rsGrid, Pal.C(16, 17, 19, .82f), Sprites.Round, "rcard", true);
                var ring = K.Border(card.transform, m.id == d.sel ? Pal.amber : Pal.line);
                if (m.id == d.sel) { var r2 = K.Border(card.transform, Pal.amber, -1); }
                var cg = card.gameObject.AddComponent<CanvasGroup>(); cg.alpha = m.locked ? .5f : 1;
                var col = K.Node(card.transform, "col").Fill(10, 10, 10, 10);
                K.V(col, 0);
                var ol = K.Node(col, "map").gameObject.AddComponent<Vec2D>(); ol.design = new Vector2(120, 80); ol.raycastTarget = false;
                K.LE(ol, -1, 70);
                if (m.outline != null) DrawOutline(ol, m.outline, m.loop, false);
                K.Spacer(col, -1, 6);
                var top = K.Row(col, 6);
                CcChip(top, m.cc, Pal.A(Color.white, .12f), Color.white);
                K.Spacer(top, -1, -1, 1);
                K.Cond(top, m.kind == "circuit" ? m.laps + " LAPS" : "SPRINT", 11, Pal.ink3, 600, 0, TextAnchor.MiddleRight);
                K.Spacer(col, -1, 4);
                K.Cond(col, m.name, 17, Pal.ink, 700);
                K.Spacer(col, -1, 3);
                K.Body(col, m.locked ? "Unlocks after " + m.need + " races" : m.km.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + " km · " + U.FmtMoney(m.reward), 12, Pal.ink2, 400, false);
                if (m.wins > 0)
                {
                    var w = K.Img(card.transform, Pal.amber, Sprites.Round, "won"); w.RT().At(1, 1, -8, -8, 34, 14);
                    var wt = K.Cond(w.transform, "WON", 10, Pal.dark, 700, 0, TextAnchor.MiddleCenter); wt.RT().Fill();
                }
                var b = card.gameObject.AddComponent<UiButton>(); b.targetGraphic = card; b.transition = Selectable.Transition.None;
                var focus = K.Border(card.transform, Pal.amber, 3); focus.sprite = Sprites.Ring2;
                b.pref = m.id == d.sel;
                bool sel = m.id == d.sel;
                b.paint = x => { ring.color = sel ? Pal.amber : x.Hot ? Pal.ink3 : Pal.line; focus.enabled = x.Focus && !sel; col.anchoredPosition = new Vector2(0, x.Hot ? 1 : 0); };
                b.onClick.AddListener(() => { AudioSys.A?.Ui("click"); Emit("raceSel", map.id); });
                b.Repaint();
            }
            var md = d.maps.Find(x => x.id == d.sel) ?? (list.Count > 0 ? list[0] : null);
            K.Clear(rsDetail);
            if (md == null) return;
            var rdTop = K.Row(rsDetail, 0);
            CcChip(rdTop, md.cc, Pal.A(Color.white, .12f), Color.white);
            K.Txt(rdTop, (md.country + " · " + md.region), Fonts.Body(400), 12.5f, Pal.ink2);
            K.Cond(rsDetail, md.name, 26, Color.white, 700);
            var rmap = K.Img(rsDetail, new Color(0, 0, 0, .25f), Sprites.Round, "rd-map"); K.LE(rmap, -1, 212);
            var ov = K.Node(rmap.transform, "o").Fill().gameObject.AddComponent<Vec2D>(); ov.design = new Vector2(320, 200); ov.raycastTarget = false;
            if (md.outline != null) DrawOutline(ov, md.outline, md.loop, true);
            K.Body(rsDetail, md.desc, 13.5f, Pal.ink2);
            var stats = K.Node(rsDetail, "rd-stats");
            var gl = stats.gameObject.AddComponent<GridLayoutGroup>(); gl.cellSize = new Vector2(163, 40); gl.spacing = new Vector2(14, 6);
            gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 2;
            void St(string l, string v) { var c = K.Col(stats, 1); K.Txt(c, l, Fonts.Body(400), 11, Pal.ink3); K.Cond(c, v, 17, Pal.ink, 600); }
            bool circ = md.kind == "circuit";
            St("TYPE", circ ? "CIRCUIT" : "SPRINT"); St("LENGTH", md.km.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) + " KM");
            St(circ ? "LAPS" : "FINISH", circ ? md.laps.ToString() : "A › B"); St("WIN", U.FmtMoney(md.reward));
            St("BEST LAP", string.IsNullOrEmpty(md.bestLap) ? "—" : md.bestLap); St("WINS", md.wins.ToString());
            K.LE(stats, -1, 3 * 40 + 2 * 6);
            var opp = K.Row(rsDetail, 10, "rd-opp");
            var ol2 = K.Txt(opp, "OPPONENTS", Fonts.Body(400), 12, Pal.ink2, TextAnchor.MiddleLeft); K.LE(ol2, -1, -1, 1);
            Btn(opp, "−", 0, () => Emit("raceOpp", -1), "click", true);
            var on = K.Cond(opp, d.opponents.ToString(), 20, Color.white, 700, 0, TextAnchor.MiddleCenter); K.LE(on, 22, -1);
            Btn(opp, "+", 0, () => Emit("raceOpp", 1), "click", true);
            K.Spacer(rsDetail, -1, -1, -1, 1);
            var id = md.id;
            var go = Btn(rsDetail, md.locked ? "LOCKED · " + md.need + " RACES" : "START RACE ›", 2, () => { if (!md.locked) Emit("raceGo", id); }, md.locked ? null : "buy");
            go.interactable = !md.locked;
        }

        // track outline into a Vec2D (canvas size = its design size)
        static void DrawOutline(Vec2D g, IList<Vector2> pts, bool loop, bool big)
        {
            g.Clear();
            if (pts == null || pts.Count < 2) { g.Commit(); return; }
            float W = g.design.x, H = g.design.y;
            float x0 = 1e9f, x1 = -1e9f, z0 = 1e9f, z1 = -1e9f;
            foreach (var p in pts) { x0 = Mathf.Min(x0, p.x); x1 = Mathf.Max(x1, p.x); z0 = Mathf.Min(z0, p.y); z1 = Mathf.Max(z1, p.y); }
            float sc = Mathf.Min((W - 16) / Mathf.Max(1, x1 - x0), (H - 16) / Mathf.Max(1, z1 - z0));
            var q = new List<Vector2>(pts.Count);
            foreach (var p in pts) q.Add(new Vector2(W / 2 + (p.x - (x0 + x1) / 2) * sc, H / 2 - (p.y - (z0 + z1) / 2) * sc));
            g.Stroke(q, big ? 7 : 5, new Color(0, 0, 0, .5f), loop);
            g.Stroke(q, big ? 3 : 2.2f, Pal.A(Pal.ink, .9f), loop);
            g.Rect(q[0].x - 3, q[0].y - 3, 6, 6, Pal.amber);
            g.Commit();
        }

        // ------------------------------------------------------------- race presentation
        RectTransform cine, lbTop, lbBot, evCard, evGrid;
        CanvasGroup cineCg, evCardCg, evGridCg;
        Image flash;
        Text evCc, evPlace, evName, evLine, evSkip;
        int cineT;

        void BuildCine()
        {
            cine = K.Node(root, "cine").Fill();
            cineCg = cine.gameObject.AddComponent<CanvasGroup>(); cineCg.blocksRaycasts = false; cineCg.interactable = false;
            float lbh = 1080 * 0.11f;
            lbTop = K.Img(cine, Color.black, Sprites.White, "lb-top").RT();
            lbTop.anchorMin = new Vector2(0, 1); lbTop.anchorMax = new Vector2(1, 1); lbTop.pivot = new Vector2(.5f, 1); lbTop.sizeDelta = new Vector2(0, lbh); lbTop.anchoredPosition = Vector2.zero;
            lbBot = K.Img(cine, Color.black, Sprites.White, "lb-bot").RT();
            lbBot.anchorMin = new Vector2(0, 0); lbBot.anchorMax = new Vector2(1, 0); lbBot.pivot = new Vector2(.5f, 0); lbBot.sizeDelta = new Vector2(0, lbh); lbBot.anchoredPosition = Vector2.zero;
            flash = K.Img(cine, new Color(0, 0, 0, 0), Sprites.White, "flash"); flash.RT().Fill();
            evCard = Box(cine, 0, 0, PAD + 8, lbh + 26, 1150, 200, "evcard");
            K.V(evCard, 0, 0, 0, 0, 0, TextAnchor.LowerLeft, false); K.Fit(evCard, true, true);
            evCardCg = evCard.gameObject.AddComponent<CanvasGroup>();
            var top = K.Row(evCard, 10);
            var cc = K.Img(top, Pal.amber, Sprites.Round, "cc"); K.H(cc, 0, 6, 6, 2, 2, TextAnchor.MiddleCenter);
            evCc = K.Cond(cc.transform, "", 13, Pal.dark, 600, .08f);
            evPlace = K.Cond(top, "", 13, Pal.A(Color.white, .8f), 600, .16f);
            evName = K.Cond(evCard, "", 72, Color.white, 700, .02f);
            evName.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .5f);
            var lineHolder = K.Col(evCard, 8, "ev-line");
            lineHolder.GetComponent<VerticalLayoutGroup>().childForceExpandWidth = false;
            var bar = K.Img(lineHolder, Pal.amber, Sprites.White, "bar"); K.LE(bar, -1, 2);
            evLine = K.Cond(lineHolder, "", 15, Pal.amber, 600, .14f);
            lineHolder.GetComponent<VerticalLayoutGroup>().childForceExpandWidth = true;
            K.Fit(lineHolder, true, false);
            evGrid = Box(cine, 1, 1, -PAD, -(lbh + 18), 230, 400, "evgrid");
            K.V(evGrid, 2);
            evGridCg = evGrid.gameObject.AddComponent<CanvasGroup>();
            evSkip = K.Cond(cine, "SPACE · SKIP", 11, Pal.A(Color.white, .55f), 600, .16f, TextAnchor.LowerRight);
            evSkip.RT().At(1, 0, -PAD, lbh + 22, 300, 16);
            cine.gameObject.SetActive(false);
        }
        void SetCineOn(bool on) { cineOn = on; }

        public void RaceIntro(RaceIntroData d)
        {
            evCc.text = d.cc;
            evPlace.text = (d.country + (string.IsNullOrEmpty(d.region) ? "" : " · " + d.region)).ToUpperInvariant();
            evName.text = d.name;
            evLine.text = d.line;
            K.Clear(evGrid);
            K.Cond(evGrid, "STARTING GRID", 11, Pal.A(Color.white, .7f), 600, .16f);
            K.Spacer(evGrid, -1, 2);
            foreach (var gr in d.grid)
            {
                var row = K.Img(evGrid, gr.me ? Pal.A(Pal.amber, .85f) : Pal.C(10, 11, 12, .62f), Sprites.White, "eg");
                K.H(row, 8, 8, 8, 4, 4);
                var i = K.Cond(row.transform, gr.pos.ToString(), 13, gr.me ? Pal.C(20, 16, 10, .75f) : Pal.A(Color.white, .6f), 600); K.LE(i, 20, -1);
                var sw = K.Img(row.transform, Pal.Parse(gr.color, Pal.amber), Sprites.White, "s"); K.LE(sw, 4, 14);
                var n = K.Cond(row.transform, K.Esc(gr.name), 13, gr.me ? Pal.dark : Color.white, 600); K.LE(n, -1, -1, 1);
                K.Cond(row.transform, K.Esc(gr.car), 11, gr.me ? Pal.C(20, 16, 10, .75f) : Pal.A(Color.white, .55f), 600, .06f, TextAnchor.MiddleRight);
            }
            evSkip.gameObject.SetActive(d.skippable);
            SetCineOn(true);
            Cancel(cineT);
            cine.gameObject.SetActive(true);
            cineCg.alpha = 1;
            float lbh = 1080 * 0.11f;
            Animate(0.6f, k => { float e = 1 - Mathf.Pow(1 - k, 3); lbTop.sizeDelta = new Vector2(0, lbh * e); lbBot.sizeDelta = new Vector2(0, lbh * e); }, null, lbTop);
            evCardCg.alpha = 0; evGridCg.alpha = 0;
            After(0.5f, () => Animate(0.6f, k => { float e = 1 - Mathf.Pow(1 - k, 3); evCardCg.alpha = k; evCard.anchoredPosition = new Vector2(PAD + 8 - 24 * (1 - e), lbh + 26); }, null, evCardCg));
            After(1.2f, () => Animate(0.6f, k => evGridCg.alpha = k, null, evGridCg));
        }
        public void IntroCut() { Animate(0.45f, k => flash.color = new Color(0, 0, 0, .85f * (1 - k)), null, flash); }
        public void RaceIntroHide()
        {
            SetCineOn(false);
            Cancel(cineT);
            if (!cine.gameObject.activeSelf) return;
            Animate(0.5f, k => cineCg.alpha = 1 - k, null, cineCg);
            cineT = After(0.55f, () => cine.gameObject.SetActive(false));
        }

        RectTransform pod, podPlaces;
        void BuildPodium()
        {
            pod = K.Node(root, "podium");
            pod.anchorMin = Vector2.zero; pod.anchorMax = new Vector2(1, 0); pod.pivot = new Vector2(.5f, 0); pod.sizeDelta = new Vector2(0, 260); pod.anchoredPosition = Vector2.zero;
            var bg = pod.gameObject.AddComponent<RawImage>(); bg.texture = Tex.Gradient(false, (0, Pal.clear), (1, new Color(0, 0, 0, .7f))); bg.raycastTarget = false;
            K.V(pod, 12, (int)PAD, (int)PAD, 60, (int)PAD + 6, TextAnchor.LowerCenter, false);
            K.Fit(pod, false, true);
            K.Cond(pod, "PODIUM", 14, Pal.amber, 700, .3f, TextAnchor.UpperCenter);
            podPlaces = K.Row(pod, 10, "places", TextAnchor.LowerCenter);
            var go = Btn(pod, "RESULTS ›", 2, () => Emit("podiumSkip"));
            go.pref = true;
            pod.gameObject.AddComponent<CanvasGroup>();
            pod.gameObject.SetActive(false);
        }
        public void Podium(PodiumData d)
        {
            K.Clear(podPlaces);
            var order = new List<PodiumPlace>();
            foreach (var p in d.places) if (p.place == 2) order.Add(p);
            foreach (var p in d.places) if (p.place == 1) order.Add(p);
            foreach (var p in d.places) if (p.place == 3) order.Add(p);
            foreach (var p in d.places) if (p.place > 3) order.Add(p);
            foreach (var p in order)
            {
                var c = K.Img(podPlaces, p.me ? Pal.C(60, 46, 20, .9f) : Pal.C(12, 13, 14, .82f), Sprites.White, "pd");
                K.LE(c, 200, -1);
                var topc = p.place == 1 ? Pal.C(232, 181, 58) : p.place == 2 ? Pal.C(201, 204, 209) : p.place == 3 ? Pal.C(176, 116, 64) : Pal.C(136, 136, 136);
                var tb = K.Img(c.transform, topc, Sprites.White, "top"); tb.RT().Span(0, 1, 1, 1, 0, 0, 0, -3); tb.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
                K.H(c, 8, 14, 14, p.place == 1 ? 18 : 10, 10, TextAnchor.UpperLeft);
                var i = K.Cond(c.transform, p.place.ToString(), 34, Pal.A(Color.white, .85f), 700); K.LE(i, 34, -1);
                var col = K.Col(c.transform, 1); K.LE(col, -1, -1, 1);
                var n = K.Cond(col, K.Esc(p.name), 18, Color.white, 700); n.horizontalOverflow = HorizontalWrapMode.Wrap; n.verticalOverflow = VerticalWrapMode.Truncate; K.LE(n, -1, 24);
                K.Cond(col, K.Esc(p.car), 11, Pal.ink2, 600, .1f);
                K.Cond(col, p.time ?? "", 13, Pal.amber, 600);
            }
            SetCineOn(true);
            pod.gameObject.SetActive(true);
            var cg = pod.GetComponent<CanvasGroup>();
            Animate(0.7f, k => { float e = 1 - Mathf.Pow(1 - k, 3); cg.alpha = k; pod.anchoredPosition = new Vector2(0, -20 * (1 - e)); }, null, pod);
            AutoFocus();
        }
        public void PodiumHide() { pod.gameObject.SetActive(false); SetCineOn(false); }

        // ------------------------------------------------------------- online
        Text olSub, olMsg;
        InputField olName, olCode;
        UiButton olQuick, olHost, olJoin, olFriend;
        RectTransform olList, olLobby;
        void BuildOnline()
        {
            var s = NewScreen("online");
            var bg = K.Node(s.rt, "bg").Fill().gameObject.AddComponent<RawImage>();
            bg.texture = Tex.Gradient(false, (0, Pal.C(10, 11, 12, .55f)), (1, Pal.C(10, 11, 12, .82f))); bg.raycastTarget = true;
            (_, olSub) = TopTitle(s.rt, "ONLINE", "UP TO 8 DRIVERS PER LOBBY");
            var main = K.Panel(s.rt, "ol-main");
            var mr = main.RT(); mr.anchorMin = new Vector2(0, 0); mr.anchorMax = new Vector2(0, 1); mr.pivot = new Vector2(0, .5f);
            mr.offsetMin = new Vector2(PAD, PAD + 52); mr.offsetMax = new Vector2(PAD + 360, -PAD - 74);
            var msc = K.Scroll(main.transform, out var mc); msc.RT().Fill();
            var mv = mc.GetComponent<VerticalLayoutGroup>(); mv.padding = new RectOffset(20, 20, 18, 18); mv.spacing = 10;
            OlLab(mc, "DRIVER NAME");
            olName = Field(mc, "", 16);
            olName.onEndEdit.AddListener(v => Emit("olName", v));
            olFriend = Btn(mc, "PLAY WITH A FRIEND ›", 2, () => Emit("olHost", false), "buy");
            K.Body(mc, "Creates a private lobby with a one-time code. Send your friend the invite link.", 12.5f, Pal.ink2);
            var r1 = K.Row(mc, 8);
            olQuick = Btn(r1, "QUICK MATCH", 0, () => Emit("olQuick"), "buy"); K.LE(olQuick, -1, -1, 1);
            olHost = Btn(r1, "PUBLIC LOBBY", 0, () => Emit("olHost", true)); K.LE(olHost, -1, -1, 1);
            var r2 = K.Row(mc, 8);
            olCode = Field(r2, "FRIEND CODE", 8); K.LE(olCode, -1, 40, 1);
            olJoin = Btn(r2, "JOIN", 0, () => Emit("olJoin", olCode.text)); K.LE(olJoin, -1, -1, 1);
            OlLab(mc, "OPEN LOBBIES");
            olList = K.Col(mc, 4, "ol-list");
            K.LE(olList, -1, -1, -1, -1, -1, 60);
            olMsg = K.Cond(mc, "", 13, Pal.C(255, 138, 106), 600, .06f);
            var lob = K.Panel(s.rt, "ol-lobby");
            olLobby = lob.RT(); olLobby.anchorMin = new Vector2(1, 0); olLobby.anchorMax = new Vector2(1, 1); olLobby.pivot = new Vector2(1, .5f);
            olLobby.offsetMin = new Vector2(-PAD - 440, PAD + 52); olLobby.offsetMax = new Vector2(-PAD, -PAD - 74);
            K.V(lob, 12, 20, 20, 18, 18);
            var back = Btn(s.rt, "‹ BACK", 0, () => Emit("olBack"), "back");
            var br = back.RT(); br.anchorMin = br.anchorMax = br.pivot = Vector2.zero; br.anchoredPosition = new Vector2(PAD, PAD);
            K.Fit(back, true, true);
        }
        static void OlLab(Transform p, string s) { var t = K.Cond(p, s, 11, Pal.ink2, 600, .14f); Pad(t, 0, 4, 0, 0); }
        readonly List<(InputField, Image)> fields = new List<(InputField, Image)>();
        InputField Field(Transform p, string placeholder, int max)
        {
            var img = K.Img(p, new Color(0, 0, 0, .35f), Sprites.Round, "input", true);
            K.LE(img, -1, 40);
            var brd = K.Border(img.transform, Pal.line);
            var txt = K.Cond(img.transform, "", 16, Color.white, 600, 0, TextAnchor.MiddleLeft);
            txt.RT().Fill(11, 0, 11, 0); txt.supportRichText = false;
            var ph = K.Cond(img.transform, placeholder, 16, Pal.ink3, 600, 0, TextAnchor.MiddleLeft);
            ph.RT().Fill(11, 0, 11, 0);
            var f = img.gameObject.AddComponent<InputField>();
            f.textComponent = txt; f.placeholder = ph; f.characterLimit = max; f.targetGraphic = img;
            f.transition = Selectable.Transition.None;
            f.lineType = InputField.LineType.SingleLine;
            f.caretColor = Pal.amber; f.customCaretColor = true; f.selectionColor = Pal.A(Pal.amber, .35f);
            f.onValidateInput = (s, i, c) => char.ToUpperInvariant(c);
            fields.Add((f, brd));
            return f;
        }

        public void Online(OnlineData d)
        {
            var scope = screens["online"].rt;
            int fi = Typing ? -1 : FocusIndex(scope);
            OnlineBody(d);
            Refocus(scope, fi);
        }
        void OnlineBody(OnlineData d)
        {
            if (!olName.isFocused) olName.text = d.name ?? "";
            olSub.text = !d.avail ? "OFFLINE · BOTS ONLY" : d.connected ? (d.via == "p2p" ? "ONLINE · DIRECT CONNECTION · UP TO 8 DRIVERS" : "ONLINE · UP TO 8 DRIVERS PER LOBBY") : "CONNECTING…";
            foreach (var b in new[] { olQuick, olHost, olJoin, olFriend }) b.interactable = d.avail && !d.busy && !d.inLobby;
            K.Clear(olList);
            if (!d.avail)
            {
                K.Body(olList, "This copy can't reach the lobby server. To race anyone with a link, open the public version:", 13, Pal.ink2);
                var link = Btn(olList, PUBLIC_URL.Replace("https://", ""), 0, () => Application.OpenURL(PUBLIC_URL), "click", true);
                link.label.color = Pal.amber;
            }
            else if (d.lobbies.Count == 0) K.Body(olList, "No open lobbies right now. Quick Match opens one and waits for others.", 13, Pal.ink2);
            else
                foreach (var l in d.lobbies)
                {
                    var lb = l;
                    var img = K.Img(olList, Pal.A(Color.white, .04f), Sprites.Round, "ol-lob", true);
                    var ring = K.Border(img.transform, Pal.line);
                    var focus = K.Border(img.transform, Pal.amber, 3); focus.sprite = Sprites.Ring2;
                    K.H(img, 8, 10, 10, 8, 8);
                    var col = K.Col(img.transform, 1); K.LE(col, -1, -1, 1);
                    K.Cond(col, K.Esc(l.host), 15, Color.white, 700);
                    K.Txt(col, K.Esc(l.mapName), Fonts.Body(400), 12, Pal.ink2);
                    K.Cond(img.transform, l.st == "race" ? "RACING" : l.n + "/8", 14, Pal.amber, 700, 0, TextAnchor.MiddleRight);
                    var b = img.gameObject.AddComponent<UiButton>(); b.targetGraphic = img; b.transition = Selectable.Transition.None;
                    var cg = img.gameObject.AddComponent<CanvasGroup>();
                    b.interactable = !(l.st == "race" || l.n >= 8 || d.inLobby);
                    b.paint = x => { ring.color = x.Hot ? Pal.amber : Pal.line; cg.alpha = x.interactable ? 1 : .45f; focus.enabled = x.Focus; };
                    b.onClick.AddListener(() => { AudioSys.A?.Ui("click"); Emit("olJoin", lb.code); });
                    b.Repaint();
                }
            olMsg.text = d.msg ?? "";
            olLobby.gameObject.SetActive(d.inLobby);
            if (!d.inLobby) return;
            K.Clear(olLobby);
            var cb = K.Col(olLobby, 2, "ol-code-big");
            K.Cond(cb, "ONE-TIME LOBBY CODE", 11, Pal.ink2, 600, .14f);
            K.Cond(cb, K.Esc((d.code ?? "").ToUpperInvariant()), 40, Color.white, 700, .18f);
            K.Txt(cb, (d.pub ? "PUBLIC" : "PRIVATE") + " · VALID FOR THIS LOBBY ONLY · EXPIRES WHEN THE RACE STARTS", Fonts.Body(400), 11, Pal.ink2, TextAnchor.UpperLeft, .06f, true);
            if (!string.IsNullOrEmpty(d.invite))
            {
                var inv = K.Row(olLobby, 6, "ol-invite");
                var lnk = Field(inv, "", 200); lnk.text = d.invite; lnk.readOnly = true; lnk.textComponent.font = Fonts.Body(500); lnk.textComponent.fontSize = 12;
                K.LE(lnk, -1, 36, 1);
                UiButton cp = null;
                cp = Btn(inv, "COPY LINK", 0, () =>
                {
                    GUIUtility.systemCopyBuffer = d.invite;
                    SetLabel(cp, "COPIED");
                    After(1.6f, () => { if (cp) SetLabel(cp, "COPY LINK"); });
                }, "click", true);
            }
            var tr = K.Col(olLobby, 4, "ol-track");
            K.Cond(tr, "TRACK", 11, Pal.ink2, 600, .14f);
            if (d.isHost && d.maps.Count > 0)
            {
                // the web <select>: step through the maps
                int idx = Math.Max(0, d.maps.FindIndex(m => m.id == d.map));
                var row = K.Row(tr, 6);
                Btn(row, "‹", 0, () => Emit("olMap", d.maps[(idx - 1 + d.maps.Count) % d.maps.Count].id), "click", true);
                var cur = d.maps[idx];
                var nm = K.Cond(row, K.Esc(cur.cc + " · " + cur.name), 15, Color.white, 600, 0, TextAnchor.MiddleCenter); K.LE(nm, -1, -1, 1);
                Btn(row, "›", 0, () => Emit("olMap", d.maps[(idx + 1) % d.maps.Count].id), "click", true);
            }
            else K.Cond(tr, K.Esc(d.mapName), 18, Color.white, 700);
            var mem = K.Col(olLobby, 3, "ol-members");
            foreach (var m in d.members) Member(mem, m.host ? "HOST" : m.rdy ? "READY" : "", K.Esc(m.name) + (m.me ? "  <size=10><color=" + Pal.Hex(Pal.ink2) + ">YOU</color></size>" : ""), K.Esc(m.carName), m.me, false);
            for (int i = d.members.Count; i < 8; i++) Member(mem, "", "OPEN SLOT", "", false, true);
            K.Spacer(olLobby, -1, -1, -1, 1);
            var foot = K.Row(olLobby, 8, "ol-foot");
            Btn(foot, "LEAVE", 0, () => Emit("olLeave"), "back");
            K.Spacer(foot, -1, -1, 1);
            if (d.isHost) { var st = Btn(foot, "PLAY ›", 2, () => Emit("olStart"), "buy"); st.pref = true; }
            else { var rd = Btn(foot, d.ready ? "READY" : "READY?", d.ready ? 1 : 2, () => Emit("olReady")); rd.pref = true; }
            int ready = 0; foreach (var m in d.members) if (m.rdy || m.host) ready++;
            K.Body(olLobby, d.isHost ? (d.members.Count < 2 ? "Waiting for your friend… send the link or the code. You can also start alone." : ready + "/" + d.members.Count + " ready · press PLAY when everyone is in") : "The host presses PLAY to start the race.", 12, Pal.ink2);
        }
        void Member(Transform p, string tag, string name, string car, bool me, bool empty)
        {
            var row = K.Img(p, me ? Pal.A(Pal.amber, .1f) : Pal.A(Color.white, .04f), Sprites.White, "ol-m");
            K.H(row, 8, 10, 10, 6, 6);
            var edge = K.Img(row.transform, me ? Pal.amber : Pal.clear, Sprites.White, "edge");
            edge.RT().anchorMin = Vector2.zero; edge.RT().anchorMax = new Vector2(0, 1); edge.RT().pivot = new Vector2(0, .5f); edge.RT().sizeDelta = new Vector2(3, 0); edge.RT().anchoredPosition = Vector2.zero;
            edge.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            var i = K.Cond(row.transform, tag, 10, Pal.amber, 700, .12f); K.LE(i, 54, -1);
            var b = K.Cond(row.transform, name, 15, Color.white, 700); K.LE(b, -1, -1, 1);
            K.Cond(row.transform, car, 12, Pal.ink2, 600, .06f, TextAnchor.MiddleRight);
            if (empty) row.gameObject.AddComponent<CanvasGroup>().alpha = .35f;
        }

        // ------------------------------------------------------------- race result
        RectTransform rrPanel;
        void BuildRaceRes()
        {
            var s = NewScreen("raceres");
            var dim = K.Img(s.rt, Pal.C(8, 9, 10, .55f), Sprites.White, "dim", true); dim.RT().Fill();
            rrPanel = CenterPanel(s.rt, 560, 0.92f, out _, 26, 22).RT();
        }
        public void RaceResults(RaceResultsData d)
        {
            var body = BodyOf(rrPanel);
            K.Clear(body);
            K.Txt(body, K.Esc(d.mapName + " · " + d.mapCountry), Fonts.Body(400), 12.5f, Pal.amber);
            var h2 = K.Cond(body, d.title, 44, Color.white, 700); Pad(h2, 0, 2, 0, 12);
            var table = K.Col(body, 2, "rtable");
            foreach (var r in d.rows)
            {
                var row = K.Img(table, r.me ? Pal.A(Pal.amber, .9f) : Pal.A(Color.white, .04f), Sprites.Round, "rrow");
                K.H(row, 10, 10, 10, 6, 6);
                var c = r.me ? Pal.dark : Pal.ink;
                var i = K.Cond(row.transform, r.pos.ToString(), 15, c, 600, 0, TextAnchor.MiddleRight); K.LE(i, 22, -1);
                var sw = K.Img(row.transform, Pal.Parse(r.color, Pal.amber), Sprites.White, "s"); K.LE(sw, 4, 16);
                var n = K.Cond(row.transform, K.Esc(r.name) + "  <size=11><color=" + Pal.Hex(Pal.A(c, .65f)) + ">" + K.Esc(r.car) + "</color></size>", 15, c, 600); K.LE(n, -1, -1, 1);
                K.Cond(row.transform, r.time, 15, c, 600, 0, TextAnchor.MiddleRight);
            }
            K.Spacer(body, -1, 12);
            var lines = K.Col(body, 0, "lines");
            foreach (var l in d.lines) LineRow(lines, l[0], l[1], false, true);
            LineRow(lines, "TOTAL", U.FmtMoney(d.total), true, true);
            if (!string.IsNullOrEmpty(d.gift))
            {
                var g = K.Img(body, Pal.clear, Sprites.Round, "gift"); K.V(g, 0, 12, 12, 10, 10);
                K.Border(g.transform, Pal.amber);
                K.Body(g.transform, K.Rich(d.gift), 14, Pal.gold);
            }
            var foot = K.Node(body, "foot"); K.H(foot, 8, 0, 0, 14, 0, TextAnchor.MiddleRight);
            K.Spacer(foot, -1, -1, 1);
            if (d.online)
            {
                Btn(foot, "LEAVE", 0, () => Emit("olLeaveRace"), "back");
                if (d.host) Btn(foot, "REMATCH · NEW CODE ›", 2, () => Emit("olRematch"), "buy").pref = true;
                else Btn(foot, "WAITING FOR THE HOST…", 1, null).interactable = false;
            }
            else
            {
                Btn(foot, "GARAGE", 0, () => Emit("toGarage"));
                Btn(foot, "TRACKS", 0, () => Emit("raceTracks"));
                var again = Btn(foot, "RACE AGAIN", 1, () => Emit("raceAgain"), "buy");
                again.label.text = "RACE AGAIN  <size=12><color=#12121280>[R]</color></size>";
                again.pref = true;
            }
            Show("raceres", true);
            AutoFocus();
        }
    }
}
