// First start, garage (upgrades / paint / workshop panels, stat block) and the car carousel.
using System;
using System.Collections.Generic;
using UnityEngine;
using Downfall.Audio;
using UnityEngine.UI;

namespace Downfall
{
    public sealed partial class UI
    {
        // ------------------------------------------------------------- car stat block
        public void StatBlock(Transform p, IList<StatRow> rows, bool compact = false)
        {
            var box = K.Col(p, 0, "stats");
            box.GetComponent<VerticalLayoutGroup>().padding = compact ? new RectOffset(16, 16, 4, 10) : new RectOffset(20, 20, 6, 14);
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i];
                var st = K.Col(box, 5, "st");
                st.GetComponent<VerticalLayoutGroup>().padding = new RectOffset(0, 0, compact ? 4 : 7, compact ? 4 : 7);
                var line = K.Row(st, 10);
                var lab = K.Txt(line, r.label, Fonts.Body(500), compact ? 11 : 12.5f, Pal.ink2, TextAnchor.LowerLeft, .07f); K.LE(lab, -1, -1, 1);
                string v = r.value + (string.IsNullOrEmpty(r.unit) ? "" : $"<size={(compact ? 11 : 12)}><color={Pal.Hex(Pal.ink3)}> {r.unit}</color></size>");
                if (!string.IsNullOrEmpty(r.delta)) v += $"<size=12><color={Pal.Hex(r.deltaNeg ? Pal.red : Pal.green)}>  {r.delta}</color></size>";
                K.Cond(line, v, compact ? 15 : 17, r.up ? Pal.green : Pal.ink, 600, 0, TextAnchor.LowerRight);
                if (r.frac.HasValue)
                {
                    var bar = K.Img(st, Pal.line, Sprites.White, "barline"); K.LE(bar, -1, 2, 1);
                    if (r.maxFrac.HasValue) Fill(bar.transform, (float)r.maxFrac.Value, Pal.ink3);
                    Fill(bar.transform, (float)r.frac.Value, Pal.ink);
                }
                if (i < rows.Count - 1) K.HLine(st, Pal.A(Pal.line, .1f));
            }
        }
        // a left-anchored fill bar inside a track
        static Image Fill(Transform track, float f, Color c)
        {
            var i = K.Img(track, c, Sprites.White, "fill");
            var r = i.RT();
            r.anchorMin = Vector2.zero; r.anchorMax = new Vector2(Mathf.Clamp01(f), 1); r.offsetMin = r.offsetMax = Vector2.zero;
            i.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            return i;
        }
        static void SetFill(Image i, float f) { i.RT().anchorMax = new Vector2(Mathf.Clamp01(f), 1); }

        static Flow Chips(Transform p, IEnumerable<string> items, float size = 11, Color? col = null, int padX = 7, int padY = 4)
        {
            var fr = K.Node(p, "traits");
            var f = fr.gameObject.AddComponent<Flow>();
            if (items != null)
                foreach (var t in items)
                {
                    var chip = K.Node(fr, "chip"); K.H(chip, 0, padX, padX, padY, padY);
                    K.Border(chip, Pal.line);
                    K.Cond(chip, t, size, col ?? Pal.ink2, 500, .045f);
                }
            return f;
        }

        // ------------------------------------------------------------- first start
        RectTransform firstCard, firstDots;
        void BuildFirst()
        {
            var s = NewScreen("first");
            TopTitle(s.rt, "CHOOSE YOUR FIRST CAR", "THREE WRECKS. ONE MOUNTAIN. PICK ONE.");
            var card = K.Panel(s.rt, "carcard");
            card.RT().At(1, .5f, -PAD, 0, 380, 500);
            K.V(card, 0); K.Fit(card, false, true);
            firstCard = card.RT();
            var nav = Box(s.rt, .5f, 0, 0, PAD + 70, 400, 52, "nav");
            K.H(nav, 14, 0, 0, 0, 0, TextAnchor.MiddleCenter);
            Arrow(nav, "‹", () => Emit("firstNav", -1));
            firstDots = K.Row(nav, 8, "dots", TextAnchor.MiddleCenter);
            Arrow(nav, "›", () => Emit("firstNav", 1));
            var bb = Box(s.rt, .5f, 0, 0, PAD, 600, 46, "bottombar");
            K.H(bb, 12, 0, 0, 0, 0, TextAnchor.MiddleCenter);
            var sel = Btn(bb, "SELECT VEHICLE", 1, () => Emit("firstSelect"), "buy");
            sel.pref = true;
        }
        UiButton Arrow(Transform p, string glyph, Action click, float w = 52, float h = 52)
        {
            var img = K.Img(p, Pal.bg2, Sprites.Round, "arrow", true); K.LE(img, w, h);
            var b = img.gameObject.AddComponent<UiButton>(); b.targetGraphic = img; b.transition = Selectable.Transition.None;
            var ring = K.Border(img.transform, Pal.line2);
            var focus = K.Border(img.transform, Pal.amber, 5); focus.sprite = Sprites.Ring2;
            var t = K.Cond(img.transform, glyph, w < 40 ? 24 : 22, Pal.ink, 600, 0, TextAnchor.MiddleCenter); t.RT().Fill();
            b.label = t;
            b.paint = x => { ring.color = x.Hot ? (w < 40 ? Pal.amber : Pal.ink) : (w < 40 ? Pal.line : Pal.line2); t.color = x.Hot && w < 40 ? Pal.amber : Pal.ink; focus.enabled = x.Focus; };
            b.onClick.AddListener(() => { AudioSys.A?.Ui("click"); click(); });
            b.Repaint();
            return b;
        }

        public void SetFirst(CarDef car, IList<StatRow> rows, int idx, int n)
        {
            K.Clear(firstCard);
            var head = K.Col(firstCard, 0, "head");
            head.GetComponent<VerticalLayoutGroup>().padding = new RectOffset(20, 20, 18, 14);
            K.Cond(head, car.cls, 11, Pal.amber, 500, .1f);
            K.Spacer(head, -1, 6);
            K.Cond(head, car.name, 34, Pal.ink, 700, .045f);
            K.Spacer(head, -1, 10);
            var d = K.Body(head, car.desc, 13.5f, Pal.ink2); d.lineSpacing = 1.1f;
            K.Spacer(head, -1, 12);
            Chips(head, car.traits);
            K.HLine(firstCard, Pal.line);
            StatBlock(firstCard, rows);
            K.Clear(firstDots);
            for (int i = 0; i < n; i++) { var dot = K.Img(firstDots, i == idx ? Pal.ink : Pal.line2, Sprites.White, "dot"); K.LE(dot, 22, 2); }
        }

        // ------------------------------------------------------------- garage
        Text gTitle, gSub, gCash, gKeyhints;
        readonly Dictionary<string, UiButton> gtabs = new Dictionary<string, UiButton>();
        UiButton gDrive;
        RectTransform gPanel, gStats, crCard, crCards, gTabBar;
        Text gpL, gpR;
        RectTransform gScroll, gDetail;
        ScrollRect gScrollRect, crScroll;
        CanvasGroup gInstalling; Image gInstBar;
        bool carMode;

        void BuildGarage()
        {
            var s = NewScreen("garage");
            (gTitle, gSub) = TopTitle(s.rt, "GARAGE", "");
            gCash = CashBox(s.rt);
            gKeyhints = K.Txt(s.rt, "ARROWS SELECT · ENTER BUY / CHOOSE · Q E SWITCH TAB · ESC MENU · DRAG TO ROTATE", Fonts.Body(400), 11, Pal.ink3, TextAnchor.UpperCenter, .083f);
            gKeyhints.RT().At(.5f, 1, 0, -PAD - 2, 1200, 16);
            var bar = K.Panel(s.rt, "gtabs", Pal.C(12, 13, 14, .72f), Pal.line);
            bar.RT().At(0, 1, PAD, -PAD - 74, 600, 40);
            K.H(bar, 2, 3, 3, 3, 3); K.Fit(bar, true, true);
            gTabBar = bar.RT();
            foreach (var t in new[] { ("upgrades", "UPGRADES"), ("vehicles", "VEHICLES"), ("dealer", "DEALER"), ("paint", "PAINT"), ("garage", "GARAGE"), ("menu", "MENU") })
            {
                var id = t.Item1;
                gtabs[id] = Gtab(bar.transform, t.Item2, id, () => Emit("gtab", id));
            }
            // DRIVE ›
            var dimg = K.Img(s.rt, Pal.amber, Sprites.Round, "drive", true);
            gDrive = dimg.gameObject.AddComponent<UiButton>(); gDrive.targetGraphic = dimg; gDrive.transition = Selectable.Transition.None;
            K.H(dimg, 0, 44, 44, 14, 14, TextAnchor.MiddleCenter); K.Fit(dimg, true, true);
            var dt = K.Cond(dimg.transform, "DRIVE ›", 19, Pal.dark, 600, .096f, TextAnchor.MiddleCenter);
            var dfocus = K.Border(dimg.transform, Pal.amber, 5); dfocus.sprite = Sprites.Ring2;
            gDrive.label = dt;
            gDrive.paint = x => { dimg.color = x.Hot ? Pal.amberHi : Pal.amber; dfocus.enabled = x.Focus; };
            gDrive.onClick.AddListener(() => { AudioSys.A?.Ui("buy"); Emit("gtab", "drive"); });
            gtabs["drive"] = gDrive;
            // panels
            var gp = K.Panel(s.rt, "gpanel");
            gPanel = gp.RT();
            gPanel.anchorMin = new Vector2(1, 0); gPanel.anchorMax = new Vector2(1, 1); gPanel.pivot = new Vector2(1, .5f);
            gPanel.offsetMin = new Vector2(-PAD - 400, PAD); gPanel.offsetMax = new Vector2(-PAD, -PAD - 76);
            K.V(gp, 0);
            (gpL, gpR) = PTitle(gp.transform);
            gScrollRect = K.Scroll(gp.transform, out gScroll);
            K.LE(gScrollRect, -1, -1, -1, 1, -1, 0);
            var det = K.Img(gp.transform, new Color(0, 0, 0, .25f), Sprites.White, "detail");
            gDetail = det.RT();
            K.V(det, 0, 20, 20, 16, 16);
            var dl = K.Img(det.transform, Pal.line, Sprites.White, "top"); dl.RT().Span(0, 1, 1, 1, 0, 0, 0, -1); dl.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            var gs = K.Panel(s.rt, "gstats");
            gs.RT().At(0, 1, PAD, -PAD - 130, 290, 300);
            K.V(gs, 0); K.Fit(gs, false, true);
            gStats = gs.RT();
            var cc = K.Panel(s.rt, "crcard");
            cc.RT().At(1, 1, -PAD, -PAD - 130, 330, 400);
            K.V(cc, 10, 18, 18, 16, 16); K.Fit(cc, false, true);
            crCard = cc.RT();
            var car = Box(s.rt, .5f, 0, 0, PAD, 1000, 128, "carousel");
            car.anchorMin = new Vector2(0, 0); car.anchorMax = new Vector2(1, 0); car.sizeDelta = new Vector2(-2 * PAD, 128);
            K.H(car, 6, 0, 0, 0, 0, TextAnchor.MiddleLeft);
            Arrow(car, "‹", () => Emit("crStep", -1), 34, 116);
            crScroll = K.Scroll(car, out crCards, false, "cr-cards");
            K.LE(crScroll, -1, 128, 1);
            var hl = crCards.GetComponent<HorizontalLayoutGroup>(); hl.spacing = 8; hl.padding = new RectOffset(2, 2, 10, 2); hl.childForceExpandHeight = false; hl.childAlignment = TextAnchor.LowerLeft;
            Arrow(car, "›", () => Emit("crStep", 1), 34, 116);
            var inst = Box(s.rt, .5f, 0, 0, 1080 * 0.18f, 260, 34, "installing");
            K.V(inst, 10, 0, 0, 0, 0, TextAnchor.UpperCenter);
            K.Cond(inst, "INSTALLING", 14, Pal.ink, 600, .1f, TextAnchor.UpperCenter);
            var ib = K.Img(inst, Pal.line, Sprites.White, "bar"); K.LE(ib, -1, 2);
            gInstBar = Fill(ib.transform, 0, Pal.amber);
            gInstalling = inst.gameObject.AddComponent<CanvasGroup>(); gInstalling.alpha = 0;
            CarMode(false);
        }

        UiButton Gtab(Transform p, string label, string id, Action click, float size = 15, int padX = 14, int padY = 8)
        {
            var img = K.Img(p, Pal.clear, Sprites.Round, "gtab", true);
            K.H(img, 0, padX, padX, padY, padY, TextAnchor.MiddleCenter);
            var b = img.gameObject.AddComponent<UiButton>(); b.targetGraphic = img; b.transition = Selectable.Transition.None;
            var t = K.Cond(img.transform, label, size, Pal.ink2, 600, .077f, TextAnchor.MiddleCenter);
            var focus = K.Border(img.transform, Pal.amber, 3); focus.sprite = Sprites.Ring2;
            b.label = t; b.data = id; b.hoverSound = "hover";
            b.paint = x =>
            {
                img.color = x.on ? Pal.amber : x.Hot ? Pal.A(Color.white, .06f) : Pal.clear;
                t.color = x.on ? Pal.dark : id == "dealer" ? Pal.gold : x.Hot ? Pal.ink : Pal.ink2;
                focus.enabled = x.Focus;
            };
            b.onClick.AddListener(() => { AudioSys.A?.Ui("click"); click(); });
            b.Repaint();
            return b;
        }

        public void SetGarageHeader(string title, string sub, double cash)
        {
            gTitle.text = title; gSub.text = sub; gCash.text = U.FmtMoney(cash);
        }
        public void SetGarageTab(string t)
        {
            foreach (var kv in gtabs) { if (kv.Key == "drive") continue; kv.Value.on = kv.Key == t; kv.Value.Repaint(); }
        }
        public void CarMode(bool on)
        {
            carMode = on;
            gPanel.gameObject.SetActive(!on);
            gStats.gameObject.SetActive(!on && gStatsOn);
            crCard.gameObject.SetActive(on);
            crScroll.transform.parent.gameObject.SetActive(on);
            var r = (RectTransform)gDrive.transform;
            if (on) { r.At(1, 1, -PAD, -PAD - 82, 0, 0); gDrive.label.fontSize = 16; gDrive.GetComponent<HorizontalLayoutGroup>().padding = new RectOffset(30, 30, 9, 9); }
            else { r.At(.5f, 0, 0, PAD, 0, 0); gDrive.label.fontSize = 19; gDrive.GetComponent<HorizontalLayoutGroup>().padding = new RectOffset(44, 44, 14, 14); }
        }
        bool gStatsOn = true;
        // the stat panel on the left; rows == null hides it
        public void SetGStats(string title, string tire, IList<StatRow> rows)
        {
            gStatsOn = rows != null;
            gStats.gameObject.SetActive(gStatsOn && !carMode);
            K.Clear(gStats);
            if (rows == null) return;
            var (l, r) = PTitle(gStats);
            l.text = title; r.text = tire;
            StatBlock(gStats, rows, true);
        }
        public void Installing(bool on)
        {
            Animate(0.3f, k => gInstalling.alpha = on ? Mathf.Max(gInstalling.alpha, k) : Mathf.Min(gInstalling.alpha, 1 - k), null, gInstalling);
            if (on) Animate(1.6f, k => SetFill(gInstBar, k), null, gInstBar);
        }

        void GPanelReset(string left, string right)
        {
            gpL.text = left; gpR.text = right;
            K.Clear(gScroll);
            K.Clear(gDetail);
            var dl = K.Img(gDetail, Pal.line, Sprites.White, "top"); dl.RT().Span(0, 1, 1, 1, 0, 0, 0, -1); dl.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            gScroll.anchoredPosition = Vector2.zero;
        }
        void ClearDetail()
        {
            for (int i = gDetail.childCount - 1; i >= 1; i--) { var c = gDetail.GetChild(i).gameObject; c.SetActive(false); Destroy(c); }
        }
        // a selectable list row (.upg / .gl) with the amber inset when selected
        UiButton ListRow(Transform p, bool sel, string name)
        {
            var img = K.Img(p, Pal.clear, Sprites.White, name, true);
            var b = img.gameObject.AddComponent<UiButton>(); b.targetGraphic = img; b.transition = Selectable.Transition.None;
            var inset = K.Img(img.transform, Pal.amber, Sprites.White, "inset");
            inset.RT().anchorMin = Vector2.zero; inset.RT().anchorMax = new Vector2(0, 1); inset.RT().pivot = new Vector2(0, .5f); inset.RT().sizeDelta = new Vector2(2, 0); inset.RT().anchoredPosition = Vector2.zero;
            inset.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            var bl = K.Img(img.transform, Pal.line, Sprites.White, "hr"); bl.RT().Span(0, 0, 1, 0, 0, -1, 0, 0); bl.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            b.on = sel; b.pref = sel;
            b.paint = x =>
            {
                img.color = x.Focus ? Pal.A(Pal.amber, .1f) : x.on ? Pal.A(Pal.ink, .06f) : x.hovered ? Pal.A(Pal.ink, .035f) : Pal.clear;
                inset.enabled = x.on || x.Focus;
                inset.RT().sizeDelta = new Vector2(x.Focus ? 3 : 2, 0);
            };
            b.Repaint();
            return b;
        }

        // ---- upgrades tab (main.js renderUpgrades / renderUpgDetail)
        readonly List<UiButton> upgRows = new List<UiButton>();
        UiButton upgBuy;
        public void Upgrades(UpgradesData d)
        {
            var scope = screens["garage"].rt;
            int fi = FocusIndex(scope);
            UpgradesBody(d);
            Refocus(scope, fi);
        }
        void UpgradesBody(UpgradesData d)
        {
            GPanelReset("UPGRADES", d.car);
            upgRows.Clear();
            foreach (var r in d.rows)
            {
                var row = r;
                var b = ListRow(gScroll, r.id == d.sel, "upg");
                b.data = r.id;
                K.V(b, 4, 20, 20, 12, 12);
                var top = K.Row(b.transform, 12);
                var n = K.Cond(top, r.name, 16, Pal.ink, 600, .064f); K.LE(n, -1, -1, 1);
                K.Cond(top, $"LV {r.lv}/{r.cap}", 13, Pal.ink2, 600, .038f, TextAnchor.MiddleRight);
                var mid = K.Row(b.transform, 12);
                var part = K.Body(mid, r.part, 12.5f, Pal.ink2, 400, false); K.LE(part, -1, -1, 1);
                K.Cond(mid, r.price, 15, r.priceState == "no" ? Pal.red : r.priceState == "max" ? Pal.ink3 : Pal.ink, 600, .019f, TextAnchor.MiddleRight);
                var pips = K.Row(b.transform, 2, "pips");
                K.LE(pips, -1, 3);
                pips.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = true;
                pips.GetComponent<HorizontalLayoutGroup>().childForceExpandHeight = true;
                for (int i = 0; i < r.cap; i++)
                {
                    var pip = K.Img(pips, i < r.lv ? Pal.ink : Pal.line, Sprites.White, "pip"); K.LE(pip, -1, 3, 1);
                    if (i >= r.lv && i >= r.baseCap) K.Border(pip.transform, Pal.A(Pal.amber, .35f), 1);
                }
                b.onClick.AddListener(() =>
                {
                    AudioSys.A?.Ui("click");
                    foreach (var x in upgRows) { x.on = x == b; x.pref = x.on; x.Repaint(); }
                    Emit("upgSel", row.id);
                });
                b.onSubmitAlt = () =>
                {
                    if (b.on && upgBuy && upgBuy.IsInteractable()) upgBuy.onClick.Invoke();
                    else b.onClick.Invoke();
                };
                upgRows.Add(b);
            }
        }
        public void UpgDetail(UpgDetail d)
        {
            var scope = screens["garage"].rt;
            int fi = FocusIndex(scope);
            UpgDetailBody(d);
            Refocus(scope, fi);
        }
        void UpgDetailBody(UpgDetail d)
        {
            ClearDetail();
            var p = gDetail;
            K.Cond(p, d.name, 22, Pal.ink, 700, .051f);
            var pn = K.Cond(p, d.pn, 13, Pal.amber, 500, .045f); Pad(pn, 0, 4, 0, 8);
            if (!string.IsNullOrEmpty(d.desc)) { var t = K.Body(p, d.desc, 13, Pal.ink2); Pad(t, 0, 0, 0, 12); }
            if (d.tires != null && d.tires.Count > 0)
            {
                var fr = K.Node(p, "tires"); var f = fr.gameObject.AddComponent<Flow>(); f.padding = new RectOffset(0, 0, 0, 12);
                foreach (var tb in d.tires)
                {
                    var tire = tb;
                    var img = K.Img(fr, tb.on ? Pal.ink : Pal.clear, Sprites.White, "tire", true);
                    K.H(img, 0, 9, 9, 6, 6, TextAnchor.MiddleCenter);
                    K.Border(img.transform, tb.on ? Pal.ink : Pal.line2);
                    var b = img.gameObject.AddComponent<UiButton>(); b.targetGraphic = img; b.transition = Selectable.Transition.None;
                    var lab = K.Cond(img.transform, tb.name, 11.5f, tb.on ? Pal.C(17, 17, 17) : Pal.ink2, 600, .038f, TextAnchor.MiddleCenter);
                    var focus = K.Border(img.transform, Pal.amber, 3); focus.sprite = Sprites.Ring2;
                    var cg = img.gameObject.AddComponent<CanvasGroup>();
                    b.interactable = !tb.disabled;
                    b.paint = x => { cg.alpha = x.interactable ? 1 : .3f; focus.enabled = x.Focus; };
                    b.onClick.AddListener(() => Emit("tireSel", tire.id));
                    b.Repaint();
                }
                if (!string.IsNullOrEmpty(d.tireDesc)) { var t = K.Body(p, d.tireDesc, 13, Pal.ink2); Pad(t, 0, 0, 0, 12); }
            }
            if (d.effects != null)
            {
                var fr = K.Node(p, "effects"); var f = fr.gameObject.AddComponent<Flow>(); f.gapX = 14; f.gapY = 4; f.padding = new RectOffset(0, 0, 0, 12);
                if (d.effects.Count == 0) K.Cond(fr, "IMPROVED", 13, Pal.green, 500, .026f);
                foreach (var e in d.effects) K.Cond(fr, e.text, 13, e.good ? Pal.green : Pal.red, 500, .026f);
            }
            var row = K.Row(p, 10);
            var id = d.id;
            upgBuy = Btn(row, d.buyLabel, d.buyAmber ? 2 : 0, () => Emit("upgBuy", id), null);
            K.LE(upgBuy, -1, -1, 1);
            upgBuy.interactable = d.buyEnabled;
        }

        // ---- paint tab (main.js renderPaint)
        readonly List<UiButton> swatches = new List<UiButton>();
        UiButton paintAct;
        public void Paint(PaintData d)
        {
            var scope = screens["garage"].rt;
            int fi = FocusIndex(scope);
            PaintBody(d);
            Refocus(scope, fi);
        }
        void PaintBody(PaintData d)
        {
            GPanelReset("PAINT", d.car);
            swatches.Clear();
            var gridR = K.Node(gScroll, "swatches");
            var grid = gridR.gameObject.AddComponent<GridLayoutGroup>();
            grid.padding = new RectOffset(20, 20, 16, 16); grid.spacing = new Vector2(8, 8);
            var fit = gridR.gameObject.AddComponent<GridFit>(); fit.grid = grid; fit.min = 64; fit.height = 90;
            foreach (var sw in d.swatches)
            {
                var s = sw;
                var cell = K.Node(gridR, "sw");
                var col = Pal.Parse(sw.color, Color.gray);
                var face = K.Node(cell, "face");
                face.anchorMin = new Vector2(0, 1); face.anchorMax = new Vector2(1, 1); face.pivot = new Vector2(.5f, 1); face.sizeDelta = new Vector2(0, 64); face.anchoredPosition = Vector2.zero;
                var raw = face.gameObject.AddComponent<RawImage>();
                if (sw.finish == "chrome") raw.texture = Tex2.Diagonal((0, Pal.C(238, 238, 238)), (.5f, Pal.C(102, 102, 102)), (1, Pal.C(221, 221, 221)));
                else if (sw.finish == "metallic" || sw.finish == "pearl" || sw.finish == "candy")
                    raw.texture = Tex2.Diagonal((0, col), (.55f, Color.Lerp(col, Color.white, .2f)), (1, col));
                else raw.color = col;
                raw.raycastTarget = true;
                K.Border(face, Pal.line);
                var on = K.Border(face, Pal.ink, 4); on.sprite = Sprites.Ring2;
                var name = K.Cond(cell, sw.name, 9.5f, Pal.ink3, 500, .032f, TextAnchor.UpperCenter);
                name.RT().anchorMin = new Vector2(0, 0); name.RT().anchorMax = new Vector2(1, 0); name.RT().pivot = new Vector2(.5f, 0); name.RT().sizeDelta = new Vector2(0, 16); name.RT().anchoredPosition = new Vector2(0, 4);
                name.horizontalOverflow = HorizontalWrapMode.Wrap;
                var b = face.gameObject.AddComponent<UiButton>(); b.targetGraphic = raw; b.transition = Selectable.Transition.None;
                var focus = K.Border(face, Pal.amber, 7); focus.sprite = Sprites.Ring2;
                var cg = cell.gameObject.AddComponent<CanvasGroup>(); cg.alpha = sw.locked ? .3f : 1;
                b.on = sw.on; b.pref = sw.on;
                b.paint = x => { on.enabled = x.on; focus.enabled = x.Focus; };
                b.onClick.AddListener(() =>
                {
                    AudioSys.A?.Ui("click");
                    foreach (var x in swatches) { x.on = x == b; x.pref = x.on; x.Repaint(); }
                    Emit("paintSel", s.id);
                });
                b.onSubmitAlt = () => { if (b.on && paintAct && paintAct.IsInteractable()) paintAct.onClick.Invoke(); else b.onClick.Invoke(); };
                b.Repaint();
                swatches.Add(b);
            }
        }
        public void PaintDetail(PaintDetail d)
        {
            var scope = screens["garage"].rt;
            int fi = FocusIndex(scope);
            PaintDetailBody(d);
            Refocus(scope, fi);
        }
        void PaintDetailBody(PaintDetail d)
        {
            ClearDetail();
            K.Cond(gDetail, d.name, 22, Pal.ink, 700, .051f);
            var pn = K.Cond(gDetail, (d.finish ?? "").ToUpperInvariant() + " FINISH", 13, Pal.amber, 500, .045f); Pad(pn, 0, 4, 0, 8);
            if (!string.IsNullOrEmpty(d.lockMsg)) { var t = K.Body(gDetail, d.lockMsg, 13, Pal.ink2); Pad(t, 0, 0, 0, 12); }
            var row = K.Row(gDetail, 10);
            var id = d.id;
            paintAct = Btn(row, d.label, d.style == "main" ? 1 : d.style == "amber" ? 2 : 0, () => Emit("paintAct", id), null);
            K.LE(paintAct, -1, -1, 1);
            paintAct.interactable = d.enabled;
        }

        // ---- workshop levels (main.js renderGarageLevels)
        public void GarageLevels(GarageLevelsData d)
        {
            var scope = screens["garage"].rt;
            int fi = FocusIndex(scope);
            GarageLevelsBody(d);
            Refocus(scope, fi);
        }
        void GarageLevelsBody(GarageLevelsData d)
        {
            GPanelReset("WORKSHOP", $"LEVEL {d.level}/5");
            foreach (var g in d.rows)
            {
                var row = K.Col(gScroll, 0, "gl");
                row.GetComponent<VerticalLayoutGroup>().padding = new RectOffset(20, 20, 14, 14);
                var bl = K.Img(row, Pal.line, Sprites.White, "hr"); bl.RT().Span(0, 0, 1, 0, 0, -1, 0, 0); bl.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
                var h = K.Row(row, 10);
                var c = g.state == "done" ? Pal.ink3 : g.state == "cur" ? Pal.amber : Pal.ink;
                var n = K.Cond(h, $"{g.level}. {g.name}", 16, c, 600, .064f); K.LE(n, -1, -1, 1);
                K.Cond(h, g.right == "✓" ? "DONE" : g.right, 16, c, 600, .064f, TextAnchor.MiddleRight);
                K.Spacer(row, -1, 6);
                foreach (var perk in g.perks) { var t = K.Body(row, "•  " + perk, 13, Pal.ink2); Pad(t, 16, 0, 0, 0); }
            }
            ClearDetail();
            if (d.next != null)
            {
                K.Cond(gDetail, d.next.name, 22, Pal.ink, 700, .051f);
                var t = K.Body(gDetail, "Expand the workshop. Unlocks new paint finishes, tuning headroom and better payouts.", 13, Pal.ink2); Pad(t, 0, 8, 0, 12);
                var row = K.Row(gDetail, 10);
                var b = Btn(row, "UPGRADE · " + d.next.cost, d.next.enabled ? 2 : 0, () => Emit("glevelBuy"), null);
                K.LE(b, -1, -1, 1);
                b.interactable = d.next.enabled;
            }
            else
            {
                K.Cond(gDetail, "TOP OF THE LINE", 22, Pal.ink, 700, .051f);
                var t = K.Body(gDetail, "Nothing left to build. The mountain is the only thing standing between you and everything.", 13, Pal.ink2); Pad(t, 0, 8, 0, 0);
            }
        }

        // ------------------------------------------------------------- car carousel (vehicles / dealer)
        string crKey;
        readonly List<UiButton> crButtons = new List<UiButton>();
        static readonly Dictionary<string, Color> PI = new Dictionary<string, Color>
        {
            ["D"] = Pal.C(79, 181, 216), ["C"] = Pal.C(240, 198, 58), ["B"] = Pal.C(240, 138, 50), ["A"] = Pal.C(227, 74, 59),
            ["S1"] = Pal.C(163, 94, 216), ["S2"] = Pal.C(74, 107, 224), ["X"] = Pal.C(57, 210, 122),
        };
        void PiBadge(Transform p, string letter, int pi, bool big)
        {
            var b = K.Img(p, PI.TryGetValue(letter ?? "", out var c) ? c : Pal.steel, Sprites.Round, "pi");
            K.H(b, big ? 8 : 5, big ? 8 : 5, 0, 0, 0, TextAnchor.MiddleLeft, true);
            K.Cond(b.transform, letter, big ? 18 : 11, Pal.C(17, 17, 17), 700);
            var n = K.Img(b.transform, new Color(0, 0, 0, .78f), Sprites.White, "n");
            K.H(n, 0, big ? 8 : 5, big ? 8 : 5, 3, 3, TextAnchor.MiddleCenter);
            K.Cond(n.transform, pi.ToString(), big ? 18 : 11, Color.white, 600, 0, TextAnchor.MiddleCenter);
            K.Fit(b, true, true);
            K.LE(b, -1, -1, 0, 0);
        }

        public void Carousel(CarouselData d)
        {
            var scope = screens["garage"].rt;
            int fi = FocusIndex(scope);
            CarouselBody(d);
            Refocus(scope, fi);
        }
        void CarouselBody(CarouselData d)
        {
            var sb = new System.Text.StringBuilder();
            foreach (var c in d.cars) sb.Append(c.id).Append(c.state).Append('|');
            string key = sb.ToString();
            if (key != crKey)
            {
                crKey = key;
                K.Clear(crCards);
                crButtons.Clear();
                foreach (var c in d.cars)
                {
                    var car = c;
                    var img = K.Img(crCards, Pal.clear, Sprites.White, "crc", true);
                    K.LE(img, 176, 112);
                    var grad = K.Node(img.transform, "bg").Fill().gameObject.AddComponent<RawImage>();
                    grad.texture = Tex.Gradient(false, (0, Pal.C(28, 30, 33, .88f)), (1, Pal.C(14, 15, 17, .92f))); grad.raycastTarget = false;
                    var selGrad = Tex.Gradient(false, (0, Pal.C(48, 40, 26, .92f)), (1, Pal.C(18, 16, 12, .94f)));
                    var normGrad = grad.texture;
                    var ring = K.Border(img.transform, Pal.line);
                    var bottom = K.Img(img.transform, Pal.amber, Sprites.White, "bottom"); bottom.RT().Span(0, 0, 1, 0, 0, -3, 0, 0);
                    var col = K.Node(img.transform, "col").Fill(10, 6, 10, 8);
                    K.V(col, 0);
                    var sil = K.Node(col, "sil").gameObject.AddComponent<Vec2D>(); sil.design = new Vector2(220, 84); sil.raycastTarget = false;
                    K.LE(sil, 156, 60);
                    DrawSilhouette(sil, c.sil, Pal.Parse(c.color, Pal.steel));
                    var top = K.Row(col, 6);
                    PiBadge(top, c.letter, c.pi, false);
                    var cls = K.Cond(top, c.cls, 10, Pal.ink2, 600, .1f, TextAnchor.MiddleRight); K.LE(cls, -1, -1, 1);
                    K.Cond(col, c.name, 18, Color.white, 700, .04f);
                    var priceCol = c.state == "owned" ? Pal.C(143, 209, 138) : c.state == "driving" ? Color.white : c.state == "nocash" ? Pal.ink2 : Pal.amber;
                    K.Cond(col, c.state == "driving" ? "DRIVING" : c.state == "owned" ? "OWNED" : c.price, 13, priceCol, 600);
                    var b = img.gameObject.AddComponent<UiButton>(); b.targetGraphic = img; b.transition = Selectable.Transition.None;
                    b.navigation = new Navigation { mode = Navigation.Mode.None };
                    b.data = c.id;
                    b.paint = x =>
                    {
                        ring.color = x.on ? Pal.amber : x.hovered ? Pal.line2 : Pal.line;
                        bottom.enabled = x.on;
                        grad.texture = x.on ? selGrad : normGrad;
                        col.anchoredPosition = new Vector2(0, x.on ? 4 : 0);
                    };
                    b.onClick.AddListener(() => { AudioSys.A?.Ui("click"); Emit("crSel", car.id); });
                    crButtons.Add(b);
                }
            }
            UiButton selB = null;
            foreach (var b in crButtons) { b.on = (string)b.data == d.sel; b.Repaint(); if (b.on) selB = b; }
            if (selB) { var sb2 = selB; After(0.02f, () => { if (sb2) K.ScrollIntoView(crScroll, (RectTransform)sb2.transform); }); }
            // detail card
            var x2 = d.detail;
            K.Clear(crCard);
            if (x2 == null) return;
            var crh = K.Row(crCard, 12);
            PiBadge(crh, x2.letter, x2.pi, true);
            var hc = K.Col(crh, 3); K.LE(hc, -1, -1, 1);
            K.Cond(hc, x2.name, 28, Color.white, 700, .03f);
            K.Cond(hc, x2.cls + " · " + x2.drive, 11, Pal.ink2, 600, .12f);
            var bars = K.Col(crCard, 7, "crbars");
            foreach (var b in x2.bars)
            {
                var r = K.Row(bars, 8);
                var l = K.Cond(r, b.label, 11, Pal.ink2, 600, .1f); K.LE(l, 86, -1);
                var track = K.Img(r, Pal.A(Color.white, .08f), Sprites.White, "bar"); K.LE(track, -1, 6, 1);
                var f = Fill(track.transform, (float)b.v, Pal.C(226, 170, 70));
                var hi = K.Node(f.transform, "hi").Fill().gameObject.AddComponent<RawImage>();
                hi.texture = Tex.Gradient(true, (0, Pal.C(201, 138, 42)), (1, Pal.C(242, 194, 90))); hi.raycastTarget = false;
                if (b.max.HasValue)
                {
                    var m = K.Img(track.transform, Pal.A(Color.white, .55f), Sprites.White, "max");
                    var mr = m.RT(); float mx = Mathf.Clamp01((float)b.max.Value);
                    mr.anchorMin = new Vector2(mx, 0); mr.anchorMax = new Vector2(mx, 1); mr.sizeDelta = new Vector2(2, 6); mr.anchoredPosition = Vector2.zero;
                    m.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
                }
                var v = K.Cond(r, b.txt, 13, Color.white, 600, 0, TextAnchor.MiddleRight); K.LE(v, 64, -1);
            }
            K.Body(crCard, x2.desc, 13, Pal.ink2);
            Chips(crCard, x2.traits, 10, Pal.ink, 6, 3);
            var foot = K.Row(crCard, 0, "crfoot");
            UiButton act;
            if (x2.action == "current") { act = Btn(foot, "CURRENT CAR", 0, null); act.interactable = false; }
            else if (x2.action == "select") act = Btn(foot, "DRIVE THIS ›", 2, () => Emit("crAct"), null);
            else
            {
                act = Btn(foot, x2.action == "nocash" ? "NEED " + x2.need : "BUY · " + x2.price, x2.action == "buy" ? 2 : 1, () => Emit("crAct"), null);
                act.interactable = x2.action != "nocash";
            }
            act.pref = true;
            K.LE(act, -1, -1, 1);
        }

        // side-view silhouette of a car from its body dimensions (for the carousel cards)
        static void DrawSilhouette(Vec2D g, CarSil sil, Color color)
        {
            g.Clear();
            if (sil == null) { g.Commit(); return; }
            float W = 220, H = 84;
            float z0 = (float)sil.z0, z1 = (float)sil.z1, y0 = (float)sil.y0, y1 = (float)sil.y1;
            float sc = Mathf.Min((W - 20) / (z1 - z0), (H - 14) / (y1 - y0));
            float X(float z) => W / 2 + (z - (z0 + z1) / 2) * sc;
            float Y(float y) => H - 8 - (y - y0) * sc;
            g.Ellipse(W / 2, H - 7, (z1 - z0) * sc * 0.52f, 4, new Color(0, 0, 0, .35f));
            var body = new List<Vector2>();
            foreach (var p in sil.body) body.Add(new Vector2(X(p.x), Y(p.y)));
            g.Poly(body, color, Color.Lerp(color, new Color(10 / 255f, 10 / 255f, 12 / 255f), 0.0f), Y(y1), Y(y1) + (Y(y0) - Y(y1)) * 0.55f);
            // darker underside (gradient 55% → 100% to near black)
            g.Poly(body, Pal.A(color, 0), new Color(10 / 255f, 10 / 255f, 12 / 255f, .9f), Y(y1) + (Y(y0) - Y(y1)) * 0.55f, Y(y0));
            var glass = new List<Vector2>();
            foreach (var p in sil.pts) glass.Add(new Vector2(X(p.x), Y(p.y)));
            g.Poly(glass, new Color(20 / 255f, 24 / 255f, 30 / 255f, .85f));
            var sh = new List<Vector2>();
            foreach (var p in sil.shoulder) sh.Add(new Vector2(X(p.x), Y(p.y)));
            g.Stroke(sh, 1.2f, new Color(1, 1, 1, .35f), false, false);
            foreach (var w in sil.wheels)
            {
                var c = new Vector2(X(w.x), Y(w.y));
                g.Disc(c, w.z * sc, Pal.C(13, 13, 15));
                g.Disc(c, w.z * sc * 0.62f, Pal.C(141, 145, 150));
                g.Disc(c, w.z * sc * 0.2f, Pal.C(42, 44, 48));
            }
            g.Commit();
        }
    }
}
