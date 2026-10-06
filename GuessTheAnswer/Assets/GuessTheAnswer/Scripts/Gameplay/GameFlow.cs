using System;
using GuessTheAnswer.Audio;
using GuessTheAnswer.Core;
using GuessTheAnswer.Multiplayer;
using GuessTheAnswer.Shared;
using GuessTheAnswer.UI;
using GuessTheAnswer.UI.Screens;
using UnityEngine;

namespace GuessTheAnswer.Gameplay
{
    /// <summary>
    /// Client-side game flow: reacts to the authoritative room and match snapshots and decides which screen is shown
    /// (menu → matchmaking / private → lobby → game → results). Screens render the latest snapshots it keeps.
    /// </summary>
    public sealed class GameFlow
    {
        const float ResultsDelay = 2.2f;

        readonly App app;
        float resultsAt = -1f;
        bool statsRecorded;

        public RoomSnapshot Room { get; private set; }
        public MatchSnapshot Match { get; private set; }
        public QueueKind? Searching { get; private set; }
        public bool InRoom => Room != null;
        public string MyId => app.Net.LocalPlayerId;
        public IMultiplayerService Net => app.Net.Active;

        public event Action<RoomSnapshot> RoomChanged;
        public event Action<MatchSnapshot> MatchChanged;
        public event Action<QueueStatusMsg> QueueChanged;
        public event Action<MatchFoundMsg> MatchFound;
        public event Action<ErrorMsg> Error;
        public event Action<ConnectionStatus> ConnectionChanged;

        public GameFlow(App app)
        {
            this.app = app;
            var net = app.Net;
            net.RoomUpdated += OnRoom;
            net.MatchUpdated += OnMatch;
            net.LeftRoom += OnLeft;
            net.ErrorReceived += OnError;
            net.QueueUpdated += q => QueueChanged?.Invoke(q);
            net.MatchFound += OnMatchFound;
            net.StatusChanged += OnStatus;
        }

        // ───────────────────────── Snapshots ─────────────────────────

        public RoomPlayerView Me
        {
            get
            {
                if (Room?.players == null) return null;
                foreach (var p in Room.players) if (p.id == MyId) return p;
                return null;
            }
        }

        public bool IsHost => Room != null && Room.hostId == MyId;

        public int MyTeam
        {
            get
            {
                if (Match?.players != null)
                {
                    foreach (var p in Match.players) if (p.id == MyId) return p.team;
                }
                var me = Me;
                return me != null ? me.team : Teams.Red;
            }
        }

        void OnRoom(RoomSnapshot room)
        {
            bool joined = Room == null || Room.code != room.code;
            int previousState = Room != null && !joined ? Room.state : -1;
            Room = room;
            if (joined)
            {
                Searching = null;
                if (!app.Net.IsLocal) RememberRoom(room.code);
            }
            // Entering a match (first match or rematch): drop the previous match's final snapshot.
            if (room.state == (int)RoomState.InMatch && previousState != (int)RoomState.InMatch) Match = null;
            if (room.state == (int)RoomState.Lobby) Match = null;

            // While the game is still loading (e.g. resuming after a page reload) only remember the state;
            // EnterInitialScreen shows the right screen once loading is done.
            if (app.IsReady) ShowScreenFor(room);
            RoomChanged?.Invoke(room);
        }

        void ShowScreenFor(RoomSnapshot room)
        {
            switch ((RoomState)room.state)
            {
                case RoomState.Lobby:
                    resultsAt = -1f;
                    app.Platform.GameplayStop();
                    // A public match counts down on the matchmaking screen and goes straight into the game.
                    bool countingDown = room.isPublic && room.startCountdown > 0f;
                    if (!countingDown && !(app.UI.Current is LobbyScreen)) app.UI.Show<LobbyScreen>();
                    break;
                case RoomState.InMatch:
                    resultsAt = -1f;
                    if (!(app.UI.Current is GameScreen)) app.UI.Show<GameScreen>();
                    app.Platform.GameplayStart();
                    break;
                case RoomState.PostMatch:
                    app.Platform.GameplayStop();
                    if (!(app.UI.Current is GameScreen) && !(app.UI.Current is ResultsScreen)) app.UI.Show<ResultsScreen>();
                    break;
            }
        }

        /// <summary>First screen after loading: the resumed room if there is one, otherwise the main menu.</summary>
        public void EnterInitialScreen()
        {
            if (Room != null) ShowScreenFor(Room);
            else EnterMainMenu();
        }

        void OnMatch(MatchSnapshot match)
        {
            Match = match;
            // Any running phase means a new match (e.g. a rematch) whose result is still to be recorded.
            if (match.phase != (int)MatchPhase.Finished) statsRecorded = false;

            if (match.phase == (int)MatchPhase.Finished)
            {
                RecordStats(match);
                if (app.UI.Current is GameScreen && resultsAt < 0f) resultsAt = Time.unscaledTime + ResultsDelay;
            }
            MatchChanged?.Invoke(match);
        }

        void OnLeft(LeftMsg left)
        {
            if (Room == null) return;
            if (!string.IsNullOrEmpty(left.code) && left.code != Room.code) return;
            bool byChoice = left.reason == LeaveReasons.Left;
            ClearRoom();
            EnterMainMenu();
            if (!byChoice) app.UI.Toast(left.reason == LeaveReasons.Timeout ? "YOU WERE DISCONNECTED FROM THE GAME" : "THE ROOM WAS CLOSED", ToastKind.Error);
        }

        void OnError(ErrorMsg error)
        {
            Error?.Invoke(error);
            if (error.code == ErrorCodes.SessionExpired)
            {
                ForgetRoom();
                if (Room != null && !app.Net.IsLocal)
                {
                    ClearRoom();
                    EnterMainMenu();
                }
            }
        }

        void OnMatchFound(MatchFoundMsg found)
        {
            Searching = null;
            app.Audio.Play(Sfx.MatchFound);
            UIFeedback.Vibrate(40);
            MatchFound?.Invoke(found);
        }

        void OnStatus(ConnectionStatus status)
        {
            if (app.Net.IsLocal) return;
            ConnectionChanged?.Invoke(status);
            // The server drops a search when the connection drops; ask again once we are back.
            if (status == ConnectionStatus.Connected && Searching != null && Room == null) app.Net.Active.StartMatchmaking(Searching.Value);
            if (status == ConnectionStatus.Failed)
            {
                bool hadRoom = Room != null;
                bool wasBusy = hadRoom || Searching != null;
                Searching = null;
                if (Room != null) ClearRoom();
                if (wasBusy || app.UI.Current is MatchmakingScreen || app.UI.Current is PrivateScreen)
                {
                    EnterMainMenu();
                    app.UI.Toast(hadRoom ? "CONNECTION LOST" : "CAN'T REACH THE GAME SERVER · TRY PRACTICE", ToastKind.Error);
                }
            }
        }

        public void Tick(float dt)
        {
            if (resultsAt > 0f && Time.unscaledTime >= resultsAt)
            {
                resultsAt = -1f;
                if (Room != null && Room.state == (int)RoomState.PostMatch) app.UI.Show<ResultsScreen>();
            }
        }

        void RecordStats(MatchSnapshot match)
        {
            if (statsRecorded || match.end == null || match.end.stats == null || match.end.stats.Length < 2) return;
            if (match.end.reason == (int)MatchEndReason.Cancelled) return;
            statsRecorded = true;

            var stats = app.Save.Data.stats;
            var profile = app.Save.Data.profile;
            int team = MyTeam;
            var mine = match.end.stats[team];
            stats.matchesPlayed++;
            if (match.end.winnerTeam == team) stats.wins++;
            else if (match.end.winnerTeam < 0) stats.draws++;
            else stats.losses++;
            stats.correctAnswers += mine.correct;
            stats.answers += mine.answered;
            stats.bestStreak = Mathf.Max(stats.bestStreak, mine.bestStreak);
            stats.totalPoints += mine.score;
            profile.xp += (match.end.winnerTeam == team ? 60 : 25) + mine.correct * 5;
            profile.level = 1 + profile.xp / 500;
            app.Save.MarkDirty();
            if (match.end.winnerTeam == team) app.Platform.HappyTime();
        }

        // ───────────────────────── Actions from the UI ─────────────────────────

        public void EnterMainMenu()
        {
            Searching = null;
            app.UI.CloseAllPanels();
            app.UI.Show<MainMenuScreen>();
        }

        public void StartPractice(MatchSettings settings = null)
        {
            LeaveRoomSilently();
            app.Net.UsePractice();
            app.Net.Active.CreateRoom(settings ?? new MatchSettings { teamMode = (int)TeamMode.Auto });
        }

        public void StartPublic(QueueKind mode)
        {
            LeaveRoomSilently();
            app.Net.UseOnline();
            Searching = mode;
            app.Net.Active.StartMatchmaking(mode);
            app.UI.Show<MatchmakingScreen>(mode);
        }

        public void CancelSearch()
        {
            if (Searching != null) app.Net.Active.CancelMatchmaking();
            Searching = null;
            EnterMainMenu();
        }

        public void CreatePrivate()
        {
            LeaveRoomSilently();
            app.Net.UseOnline();
            app.Net.Active.CreateRoom(new MatchSettings());
        }

        public void JoinPrivate(string code)
        {
            if (!(Room != null && Room.code == code)) LeaveRoomSilently();
            app.Net.UseOnline();
            app.Net.Active.JoinRoom(code);
        }

        /// <summary>Leave the room for the main menu.</summary>
        public void LeaveRoom()
        {
            LeaveRoomSilently();
            EnterMainMenu();
        }

        void LeaveRoomSilently()
        {
            if (Room != null) app.Net.Active.LeaveRoom();
            ClearRoom();
        }

        void ClearRoom()
        {
            Room = null;
            Match = null;
            resultsAt = -1f;
            ForgetRoom();
            app.Platform.GameplayStop();
        }

        void RememberRoom(string code)
        {
            var resume = app.Save.Data.resume;
            resume.roomCode = code;
            resume.savedAtUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            app.Save.MarkDirty();
        }

        void ForgetRoom()
        {
            app.Save.Data.resume.roomCode = null;
            app.Save.MarkDirty();
        }

        /// <summary>Invite links: ?room=K7MX4Q opens the join screen with the code filled in.</summary>
        public void HandleLaunchParameters()
        {
            string code = RoomCode.Normalize(Platform.BrowserBridge.QueryParam("room"));
            if (code != null) app.UI.Show<PrivateScreen>(code);
        }

        public void MainMenuAfterResults()
        {
            app.Platform.ShowMidgameAd(LeaveRoom);
        }
    }
}
