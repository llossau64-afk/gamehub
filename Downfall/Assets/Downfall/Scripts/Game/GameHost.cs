// What the gameplay layer (Run / Race / Presentation) needs from the game controller
// (the main.js port). Narrow adapter interfaces so this layer compiles on its own; the
// controller implements them on top of World, Env, Animals, UI and the scene objects.
// Member names follow the JS (`g.save`, `g.ui.notice(...)`, `g.world.breakRail(...)`).
using System;
using System.Collections.Generic;
using UnityEngine;
using Downfall.Audio;

namespace Downfall
{
    // main.js `this` as seen by run.js / race.js
    public interface IGameHost
    {
        SaveManager save { get; }
        IGameUI ui { get; }
        Track track { get; }
        World world { get; }               // World/World.cs
        Env env { get; }                   // World/Environment.cs
        GameInput input { get; }
        Camera camera { get; }
        Particles particles { get; }
        SkidMarks skids { get; }
        Debris debris { get; }
        Transform worldScene { get; }      // parent for the run's objects (cars, pickups, rocks, podium)
        Light headlight { get; }           // tunnel spot light (JS g.headlight)
        Light flashLight { get; }          // explosion / nitro flash point light (JS g.flashLight)
        RunDebug debug { get; }            // ?bot / ?s= (may be null)
        bool onlineIsHost { get; }         // g.online && g.online.isHost
        void CheckAchievements(RunInfo run);
        string NextGoalText();
        string CheckFreeCar();             // null when nothing was unlocked
        void Platform(string ev);          // g.platform.gameplayStart / gameplayStop / happytime
        void BodyClass(string cls, bool on); // document.body.classList.toggle('cockpit' | 'race-mode')
    }

    public sealed class RunDebug { public bool bot; public double startS; }

    // ui.js methods used by the gameplay layer (UI class: PascalCase of the JS names)
    public interface IGameUI
    {
        void HudInit(double best, double cash);
        void Only(params string[] screens);
        void Show(string screen, bool on);
        void Countdown(double best, Action<string> onTick);  // ticks '3' '2' '1' 'GO' (900 ms lead-in, 650 ms steps)
        void Hint(string html, int ms);
        void Notice(string text, string sub, bool amber, int ms);
        void Feed(string text, double amount);                // amount 0: no money line
        void Toast(string html, int ms);
        void HudSpeedo(SpeedoData d);
        void Hud(HudData d);
        void Summary(SummaryData d);
        void RaceHudInit(int n, int laps, Track track);
        void RaceHud(RaceHudData d);
        void Tags(List<NameTag> tags);                        // name tags over remote drivers (empty list hides)
        void RaceIntro(RaceIntroData d);
        void RaceIntroHide();
        void IntroCut();
        void Podium(PodiumData d);
        void PodiumHide();
        void RaceResults(RaceResultsData d);
    }

    // online.js race handle (cfg.net)
    public interface IRaceNet
    {
        double startAt { get; }                         // ms since epoch (0: none)
        int RemoteCount();
        int MySlot();
        void Attach(Race race, Func<int, (double s, double d)> slotPos);
        void Update(double dt, Race race);
        void Detach();
    }

    public sealed class RaceConfig
    {
        public MapDef map;
        public int? opponents;
        public IRaceNet net;
    }

    // setTimeout on the game clock (ticked by Run.Update with the unscaled frame time)
    public sealed class RunTimers
    {
        sealed class T { public double at; public Action f; public int tag; }
        readonly List<T> list = new List<T>();
        double now;
        public int After(double ms, Action f, int tag = 0) { list.Add(new T { at = now + ms / 1000, f = f, tag = tag }); return list.Count; }
        public void Tick(double dt)
        {
            now += dt;
            for (int i = 0; i < list.Count; i++)
            {
                var t = list[i];
                if (t.at > now) continue;
                list.RemoveAt(i--);
                t.f();
            }
        }
        public void Cancel(int tag) { list.RemoveAll(t => t.tag == tag); }
        public void Clear() { list.Clear(); }
    }

    public static class GameHelpers
    {
        public static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // main.js paintFor(car, cs)
        public static (int? color, string finish) PaintFor(CarDef car, CarSave cs)
        {
            PaintDef p = null;
            foreach (var x in Upgrades.PAINTS) if (x.id == cs.paint) { p = x; break; }
            p ??= Upgrades.PAINTS[0];
            return (p.color ?? car.model.paint, p.color.HasValue ? p.finish : (car.model.sport != 0 ? "metallic" : "solid"));
        }

        // car.sound -> the audio port's EngineSound
        public static EngineSound Sound(CarDef car)
        {
            var s = car.sound;
            return new EngineSound { cyl = s.cyl, tone = s.tone ?? "", rough = (float)s.rough, @base = (float)(s.@base != 0 ? s.@base : 1), exhaust = (float)(s.exhaust != 0 ? s.exhaust : 1), pops = (float)s.pops, blower = s.blower != 0 };
        }

        public static string Hex6(int c) => "#" + (c & 0xffffff).ToString("x6");

        // Unity `Light.intensity` for a three.js physical intensity (candela-ish). Tunable.
        public static float LightScale = 0.02f;
    }
}
