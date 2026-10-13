// main.js's online handlers (openOnline, playWithFriend, renderOnline, onlineRematch, onlineStart,
// pendingInvite / invite auto-join, olTry and the ol* UI events) on top of Online + UI, so the
// game controller only implements IOnlineController and calls a few methods:
//   glue = new OnlineGlue(controller);  glue.Wire(ui)            (once, with the other ui.On(...) handlers)
//   glue.Update(Time.unscaledDeltaTime)                          (every frame)
//   glue.CheckInvite()                                           (at the end of enterMenu)
//   glue.PendingInvite() != null                                 (chooseFirst: go to the menu instead of the run)
//   glue.OpenOnline() / glue.PlayWithFriend()                    (menu actions 'online' / 'friend')
//   back key while state == "online" && !ui.ModalOpen -> ui.Emit("olBack")
//   IGameHost.onlineIsHost => glue.online != null && glue.online.isHost
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Downfall
{
    // the controller bits main.js's online code touches
    public interface IOnlineController
    {
        SaveManager save { get; }
        UI ui { get; }
        string state { get; set; }             // 'online' while the online screen is up
        string DefaultMap();                   // this.raceSel || save.data.lastMap || MAPS[0].id
        void EnterFirst();                     // no car yet: the first-car screen
        void StopRun();
        void ShowMenuCar();                    // if (!menuCar) setupMenuScene(); menuCar.group.visible = true
        void MenuMusic();                      // audio.music.setMode('menu')
        void EnterMenu();
        void StartRace(string mapId, IRaceNet net); // this.startRace(id, { net })
    }

    public sealed class OnlineGlue : IOnlineGame
    {
        public readonly IOnlineController c;
        public Online online;
        public bool olBusy, inviteDone;
        public string olMsg = "";
        string deepLink;

        public OnlineGlue(IOnlineController ctrl)
        {
            c = ctrl;
            try { Application.deepLinkActivated += OnDeepLink; } catch (Exception) { }
        }

        // the internet transport (UGS), or none: Online then reports Available() == false
        public static Func<Task<IRoom>> Transport()
        {
#if DOWNFALL_UGS
            return UgsRoom.Connect;
#else
            return null;
#endif
        }
        public static string Via =>
#if DOWNFALL_UGS
            "ugs";
#else
            null;
#endif

        public void Update(double dt) => online?.Update(dt);

        // ------------------------------------------------------------ IOnlineGame
        public string nick { get => c.save.data.nick; set { c.save.data.nick = value; c.save.Save(); } }
        public List<string> usedCodes { get => c.save.data.usedCodes; set { c.save.data.usedCodes = value; c.save.Save(); } }
        public string selectedCar => c.save.data.selected;
        public bool CarExists(string id) => !string.IsNullOrEmpty(id) && Cars.CARS.Any(x => x.id == id);
        public int? PaintOf(string carId)
        {
            if (!CarExists(carId)) return null;
            return GameHelpers.PaintFor(Cars.CarById(carId), SaveManager.CarState(c.save.data, carId)).color;
        }
        // a lobby race begins (host pressed start)
        public void OnlineStart(OnlineView view)
        {
            var map = Maps.MapById(view.map) ?? Maps.MAPS[0];
            c.ui.Show("raceres", false);
            c.StartRace(map.id, online.RaceIface(view));
        }
        // the host opened a rematch lobby and we followed it
        public void OnlineRematch()
        {
            c.ui.Show("raceres", false);
            if (c.state != "online") OpenOnline(); else RenderOnline();
        }

        // ------------------------------------------------------------ screens
        public void OpenOnline(Action then = null)
        {
            var sv = c.save.data;
            if (sv.owned.Count == 0) { c.EnterFirst(); return; }
            if (online == null)
            {
                online = new Online(this, Transport(), Via);
                online.On(_ => { if (c.state == "online") RenderOnline(); });
            }
            c.ui.Fade(true, () =>
            {
                c.StopRun();
                c.state = "online";
                c.ShowMenuCar();
                c.ui.Only("online");
                olMsg = "";
                RenderOnline();
                if (online.lobby != null) online.SetCar(sv.selected);
                c.MenuMusic();
                c.ui.Fade(false);
                if (then != null) Fire(After(online.ready, then));
            });
        }
        static async Task After(Task t, Action then) { try { await t; } catch (Exception) { } then(); }
        static void Fire(Task t) { t.ContinueWith(x => Debug.LogException(x.Exception), TaskContinuationOptions.OnlyOnFaulted); }

        // one click: a private lobby with a brand-new code, invite ready to copy
        public void PlayWithFriend()
        {
            OpenOnline(() =>
            {
                if (!online.Available() || online.lobby != null) return;
                Fire(OlTry(() => online.Host(c.DefaultMap(), false)));
            });
        }

        public void RenderOnline()
        {
            var o = online;
            if (o == null) return;
            var mid = o.view?.map ?? (o.cfg != null ? Json.Str(o.cfg, "map") : null) ?? "";
            var d = new OnlineData
            {
                avail = o.Available(), connected = o.Connected(), via = o.via, busy = olBusy, name = o.Name(),
                lobbies = o.lobbies.Select(l => new LobbyInfo { code = l.code, host = l.host, map = l.map, st = l.st, n = l.n, mapName = Maps.MapById(l.map)?.name ?? "—" }).ToList(),
                inLobby = o.lobby != null, code = o.code ?? "", pub = o.pub, isHost = o.isHost, ready = o.myReady,
                msg = !string.IsNullOrEmpty(olMsg) ? olMsg : o.closedMsg, invite = o.InviteLink(), following = o.following,
                members = o.members.Select(m => new MemberInfo { name = m.name, car = m.car, carName = CarExists(m.car) ? Cars.CarById(m.car).name : m.car, host = m.host, rdy = m.rdy, me = m.me }).ToList(),
                map = mid, mapName = Maps.MapById(mid)?.name ?? "—",
                maps = Maps.MAPS.Select(m => new MapRef { id = m.id, name = m.name, cc = m.country != null && Maps.COUNTRY_CODES.TryGetValue(m.country, out var cc) ? cc : "" }).ToList(),
            };
            c.ui.Online(d);
        }

        // ------------------------------------------------------------ invites
        // `-join <code>` on the command line, a deep link downfall://join-<code>, or (WebGL) #join-<code> / ?join=<code>
        public string PendingInvite()
        {
            if (deepLink != null) return deepLink;
            string a = null;
            try { a = Online.ParseArgs(Environment.GetCommandLineArgs()); } catch (Exception) { }
            if (a != null) return a;
            try { return Online.ParseInvite(Application.absoluteURL); } catch (Exception) { return null; }
        }
        void OnDeepLink(string url)
        {
            var code = Online.ParseInvite(url);
            if (code == null) return;
            deepLink = code; inviteDone = false;
            // already running and past the first car: go now
            if (c.save.data.owned.Count > 0 && c.state != "first") CheckInvite();
        }
        // opened through an invite: join that lobby right away (once)
        public void CheckInvite()
        {
            var inv = !inviteDone ? PendingInvite() : null;
            if (inv == null || c.save.data.owned.Count == 0) return;
            inviteDone = true;
            OpenOnline(() => { if (online.Available() && online.lobby == null) Fire(OlTry(() => online.Join(inv))); });
        }
        public void CopyInvite()
        {
            var t = online?.InviteLink();
            if (t != null) GUIUtility.systemCopyBuffer = t;
        }

        // ------------------------------------------------------------ ui events
        public async Task OlTry(Func<Task> fn)
        {
            if (olBusy) return;
            olBusy = true; olMsg = ""; RenderOnline();
            try { await fn(); }
            catch (Exception e)
            {
                var m = (e is AggregateException ae && ae.InnerException != null ? ae.InnerException : e).Message.ToUpperInvariant();
                olMsg = m.Length > 80 ? m.Substring(0, 80) : m;
            }
            olBusy = false; RenderOnline();
        }

        public void Wire(UI ui)
        {
            ui.On("olName", v => online?.SetName(v as string));
            ui.On("olQuick", _ => Fire(OlTry(() => online.Quick(c.DefaultMap()))));
            ui.On("olHost", pub => Fire(OlTry(() => online.Host(c.DefaultMap(), !(pub is bool b) || b))));
            ui.On("olJoin", code => Fire(OlTry(() => online.Join(code as string))));
            ui.On("olLeave", _ => Fire(OlTry(() => online.Leave())));
            ui.On("olReady", _ => online?.SetReady(!online.myReady));
            ui.On("olMap", id => online?.SetMap(id as string));
            ui.On("olStart", _ => online?.StartRace());
            ui.On("olBack", _ => { if (online != null) Fire(online.Leave()); c.ui.Fade(true, () => { c.EnterMenu(); c.ui.Fade(false); }); });
            ui.On("olLobby", _ => { c.ui.Show("raceres", false); OpenOnline(); });
            // after an online race: a rematch is a fresh lobby with a fresh code; leaving ends it
            ui.On("olRematch", _ => { c.ui.Show("raceres", false); OpenOnline(() => Fire(OlTry(() => online.Rematch()))); });
            ui.On("olLeaveRace", _ => { c.ui.Show("raceres", false); if (online != null) Fire(online.Leave()); OpenOnline(); });
        }
    }
}
