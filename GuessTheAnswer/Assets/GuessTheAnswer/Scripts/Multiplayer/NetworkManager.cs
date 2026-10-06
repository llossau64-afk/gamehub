using System;
using GuessTheAnswer.Shared;
using UnityEngine;

namespace GuessTheAnswer.Multiplayer
{
    /// <summary>
    /// Owns the online and the practice service and exposes whichever is active. Screens subscribe here once and keep
    /// receiving events when the game switches between online play and practice.
    /// </summary>
    public sealed class NetworkManager : MonoBehaviour
    {
        OnlineMultiplayerService online;
        LocalMultiplayerService local;
        IMultiplayerService active;

        public IMultiplayerService Active => active;
        public OnlineMultiplayerService Online => online;
        public bool IsLocal => active != null && active.IsLocal;
        public string LocalPlayerId => active?.LocalPlayerId;
        public ConnectionStatus OnlineStatus => online != null ? online.Status : ConnectionStatus.Offline;

        public event Action<ConnectionStatus> StatusChanged;
        public event Action<RoomSnapshot> RoomUpdated;
        public event Action<MatchSnapshot> MatchUpdated;
        public event Action<QueueStatusMsg> QueueUpdated;
        public event Action<MatchFoundMsg> MatchFound;
        public event Action<ErrorMsg> ErrorReceived;
        public event Action<LeftMsg> LeftRoom;

        public void Initialize(OnlineMultiplayerService onlineService, LocalMultiplayerService localService)
        {
            online = onlineService;
            local = localService;
            Hook(online);
            Hook(local);
            active = online;
        }

        void Hook(IMultiplayerService s)
        {
            s.StatusChanged += st => { if (s == active || s == online) StatusChanged?.Invoke(st); };
            s.RoomUpdated += r => { if (s == active) RoomUpdated?.Invoke(r); };
            s.MatchUpdated += m => { if (s == active) MatchUpdated?.Invoke(m); };
            s.QueueUpdated += q => { if (s == active) QueueUpdated?.Invoke(q); };
            s.MatchFound += f => { if (s == active) MatchFound?.Invoke(f); };
            s.ErrorReceived += e => { if (s == active) ErrorReceived?.Invoke(e); };
            s.LeftRoom += l => { if (s == active) LeftRoom?.Invoke(l); };
        }

        /// <summary>Switch to online play (connecting if needed).</summary>
        public IMultiplayerService UseOnline()
        {
            if (active == local) local.Disconnect();
            active = online;
            online.Connect();
            return online;
        }

        /// <summary>Switch to the on-device practice mode.</summary>
        public IMultiplayerService UsePractice()
        {
            active = local;
            local.Connect();
            return local;
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            online?.Tick(dt);
            local?.Tick(dt);
        }

        void OnDestroy()
        {
            online?.Disconnect();
        }
    }
}
