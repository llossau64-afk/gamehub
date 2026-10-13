// main.js wireUI() and the IGameUI adapter the gameplay layer (Run / Race / Presentation) talks to.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Downfall.Audio;

namespace Downfall
{
    // IGameUI -> the uGUI UI (signatures differ in a few places)
    public sealed class GameUIAdapter : IGameUI
    {
        readonly GameBoot g;
        public GameUIAdapter(GameBoot game) { g = game; }
        UI ui => g.ui;

        public void HudInit(double best, double cash) => ui.HudInit(best, cash);
        public void Only(params string[] screens) => ui.Only(screens);
        public void Show(string screen, bool on) => ui.Show(screen, on);
        public void Countdown(double best, Action<string> onTick) => ui.Countdown(best, onTick);
        public void Hint(string html, int ms) => ui.Hint(html, ms);
        public void Notice(string text, string sub, bool amber, int ms) => ui.Notice(text, sub ?? "", amber, ms);
        public void Feed(string text, double amount) => ui.Feed(text, amount);
        public void Toast(string html, int ms) => ui.Toast(html, ms);
        public void HudSpeedo(SpeedoData d) => ui.HudSpeedo(d);
        public void Hud(HudData d) => ui.Hud(d);
        public void Summary(SummaryData d) => ui.Summary(d);
        public void RaceHudInit(int n, int laps, Track track)
        {
            var px = new double[track.N]; var pz = new double[track.N];
            for (int i = 0; i < track.N; i++) { px[i] = track.px[i]; pz[i] = track.pz[i]; }
            ui.RaceHudInit(n, laps, px, pz, track.N, track.loop);
        }
        public void RaceHud(RaceHudData d) => ui.RaceHud(d);
        public void Tags(List<NameTag> tags) => ui.SetTags(g.mainCamera, tags, tags != null && tags.Count > 0);
        public void RaceIntro(RaceIntroData d) => ui.RaceIntro(d);
        public void RaceIntroHide() => ui.RaceIntroHide();
        public void IntroCut() => ui.IntroCut();
        public void Podium(PodiumData d) => ui.Podium(d);
        public void PodiumHide() => ui.PodiumHide();
        public void RaceResults(RaceResultsData d) => ui.RaceResults(d);
    }

    public sealed partial class GameBoot
    {
        static string S(object a) => a as string;
        static int I(object a) => a is int i ? i : a is double d ? (int)d : a is float f ? (int)f : a is long l ? (int)l : 0;

        void WireUI()
        {
            ui.On("menu", a =>
            {
                var sv = _save.data;
                switch (S(a))
                {
                    case "race": FadeThen(OpenRaceSelect); break;
                    case "online": glue.OpenOnline(); break;
                    case "friend": glue.PlayWithFriend(); break;
                    case "continue":
                        if (sv.owned.Count == 0) EnterFirst();
                        else FadeThen(StartRun);
                        break;
                    case "garage": FadeThen(() => EnterGarage("upgrades")); break;
                    case "vehicles": FadeThen(() => EnterGarage("vehicles")); break;
                    case "settings": OpenSettings(); break;
                    case "achievements":
                        ui.Achievements(Achievements.ACHIEVEMENTS.Select(x => new AchItem { name = x.name, desc = x.desc, reward = x.reward, done = sv.achievements.ContainsKey(x.id) }).ToList());
                        break;
                    case "credits": ui.Credits(); break;
                    case "mountain": Co(SwitchMountain()); break;
                }
            });
            ui.On("firstNav", d => { if (state != "first" || choosing) return; int n = Cars.STARTERS.Length; firstIdx = ((firstIdx + I(d)) % n + n) % n; UpdateFirst(); });
            ui.On("firstSelect", _ => Co(ChooseFirst()));
            ui.On("gtab", t => { if (state == "garage" && !(installingNow && S(t) == "menu")) Gtab(S(t)); });
            ui.On("crSel", id => crSel(S(id)));
            ui.On("crStep", d => crStep(I(d)));
            ui.On("crAct", _ => crAct());
            ui.On("upgSel", id => { if (Upgrades.CatById(S(id)) == null) return; upgSel = S(id); RenderUpgDetail(); });
            ui.On("upgBuy", id => BuyUpgrade(S(id)));
            ui.On("tireSel", id => TireSel(S(id)));
            ui.On("paintSel", id => PaintDetailFor(S(id)));
            ui.On("paintAct", id => PaintAct(S(id)));
            ui.On("glevelBuy", _ => Co(GarageLevelBuy()));
            ui.On("podiumSkip", _ => { if (run is Race r && r.pres != null) r.pres.EndPodium(); });
            ui.On("retry", _ => Retry());
            ui.On("raceSel", id => { raceSel = S(id); RenderRaceSelect(); });
            ui.On("raceOpp", d => { raceOpp = (int)U.Clamp((raceOpp ?? 5) + I(d), 0, 7); RenderRaceSelect(); });
            ui.On("raceGo", id => { if (S(id) != null) StartRace(S(id), null, null); });
            ui.On("raceBack", _ => FadeThen(EnterMenu));
            ui.On("raceAgain", _ =>
            {
                if (run is Race r0 && r0.online) return;
                ui.Show("raceres", false);
                if (run is Race r) r.Restart();
            });
            ui.On("raceTracks", _ => FadeThen(() => { ui.Show("raceres", false); OpenRaceSelect(); }));
            ui.On("toGarage", _ => FadeThen(() => EnterGarage()));
            ui.On("pause", _ => Pause(true));
            ui.On("pauseMenu", a =>
            {
                switch (S(a))
                {
                    case "resume": Pause(false); break;
                    case "restart": Pause(false); if (run != null && !(run is Race r && r.online)) run.Restart(); break;
                    case "settings": OpenSettings(); break;
                    case "garage": Pause(false); FadeThen(() => EnterGarage()); break;
                }
            });
            ui.On("modalClosed", _ => { });
            // ol* (online lobby) events: OnlineGlue.Wire(ui)
        }
    }
}
