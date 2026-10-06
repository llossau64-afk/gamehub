using System;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Multiplayer
{
    public enum ConnectionStatus
    {
        Offline,
        Connecting,
        Connected,
        Reconnecting,
        Failed,
    }

    /// <summary>
    /// Everything the game needs from a multiplayer backend. The UI and game flow only use this interface,
    /// so the backend (own WebSocket server, Photon, Unity Gaming Services ...) can be replaced.
    /// All state comes from the authority as snapshots; the client only sends intents.
    /// </summary>
    public interface IMultiplayerService
    {
        bool IsLocal { get; }
        ConnectionStatus Status { get; }
        string LocalPlayerId { get; }

        event Action<ConnectionStatus> StatusChanged;
        event Action<RoomSnapshot> RoomUpdated;
        event Action<MatchSnapshot> MatchUpdated;
        event Action<QueueStatusMsg> QueueUpdated;
        event Action<MatchFoundMsg> MatchFound;
        event Action<ErrorMsg> ErrorReceived;
        event Action<LeftMsg> LeftRoom;

        void Connect();
        void Disconnect();
        /// <summary>Called every frame on the main thread; delivers queued events.</summary>
        void Tick(float deltaTime);

        // Rooms
        void CreateRoom(MatchSettings settings);
        void JoinRoom(string code);
        void LeaveRoom();
        void SetReady(bool ready);
        void SetTeam(int team);
        void UpdateSettings(MatchSettings settings);
        void AddBot();
        void RemoveBot(string botId);
        void MovePlayer(string playerId);
        void StartMatch();

        // Public matchmaking
        void StartMatchmaking(QueueKind mode);
        void CancelMatchmaking();
        void FillWithBots();

        // Match
        void SubmitAnswer(int index);
        void UseJoker(JokerType joker);
        void SubmitTeamVote(int index);
        void SubmitSteal(int index);
        void SkipSteal();
        void RequestRematch();
        void ReturnToLobby();
    }

    /// <summary>Maps the typed calls to (type, payload) messages; implementations only deliver them.</summary>
    public abstract class MultiplayerServiceBase : IMultiplayerService
    {
        public abstract bool IsLocal { get; }
        public ConnectionStatus Status { get; private set; } = ConnectionStatus.Offline;
        public string LocalPlayerId { get; protected set; }

        public event Action<ConnectionStatus> StatusChanged;
        public event Action<RoomSnapshot> RoomUpdated;
        public event Action<MatchSnapshot> MatchUpdated;
        public event Action<QueueStatusMsg> QueueUpdated;
        public event Action<MatchFoundMsg> MatchFound;
        public event Action<ErrorMsg> ErrorReceived;
        public event Action<LeftMsg> LeftRoom;

        public abstract void Connect();
        public abstract void Disconnect();
        public abstract void Tick(float deltaTime);
        protected abstract void Send(string type, object payload);

        protected void SetStatus(ConnectionStatus status)
        {
            if (Status == status) return;
            Status = status;
            StatusChanged?.Invoke(status);
        }

        protected void RaiseRoom(RoomSnapshot s) => RoomUpdated?.Invoke(s);
        protected void RaiseMatch(MatchSnapshot s) => MatchUpdated?.Invoke(s);
        protected void RaiseQueue(QueueStatusMsg s) => QueueUpdated?.Invoke(s);
        protected void RaiseMatchFound(MatchFoundMsg s) => MatchFound?.Invoke(s);
        protected void RaiseError(ErrorMsg e) => ErrorReceived?.Invoke(e);
        protected void RaiseLeft(LeftMsg m) => LeftRoom?.Invoke(m);

        static readonly EmptyMsg Empty = new EmptyMsg();

        public void CreateRoom(MatchSettings settings) => Send(Msg.CreateRoom, new CreateRoomMsg { settings = settings ?? new MatchSettings() });
        public void JoinRoom(string code) => Send(Msg.JoinRoom, new JoinRoomMsg { code = code });
        public void LeaveRoom() => Send(Msg.LeaveRoom, Empty);
        public void SetReady(bool ready) => Send(Msg.SetReady, new ReadyMsg { ready = ready });
        public void SetTeam(int team) => Send(Msg.SetTeam, new TeamMsg { team = team });
        public void UpdateSettings(MatchSettings settings) => Send(Msg.UpdateSettings, new SettingsMsg { settings = settings });
        public void AddBot() => Send(Msg.AddBot, Empty);
        public void RemoveBot(string botId) => Send(Msg.RemoveBot, new PlayerRefMsg { playerId = botId });
        public void MovePlayer(string playerId) => Send(Msg.MovePlayer, new PlayerRefMsg { playerId = playerId });
        public void StartMatch() => Send(Msg.StartMatch, Empty);
        public void StartMatchmaking(QueueKind mode) => Send(Msg.Queue, new QueueMsg { mode = (int)mode });
        public void CancelMatchmaking() => Send(Msg.CancelQueue, Empty);
        public void FillWithBots() => Send(Msg.QueueFillBots, Empty);
        public void SubmitAnswer(int index) => Send(Msg.Answer, new IndexMsg { index = index });
        public void UseJoker(JokerType joker) => Send(Msg.UseJoker, new JokerMsg { joker = (int)joker });
        public void SubmitTeamVote(int index) => Send(Msg.TeamVote, new IndexMsg { index = index });
        public void SubmitSteal(int index) => Send(Msg.Steal, new IndexMsg { index = index });
        public void SkipSteal() => Send(Msg.SkipSteal, Empty);
        public void RequestRematch() => Send(Msg.Rematch, Empty);
        public void ReturnToLobby() => Send(Msg.ToLobby, Empty);
    }
}
