using System;
using System.Collections.Generic;
using GuessTheAnswer.Shared;
using UnityEngine;

namespace GuessTheAnswer.Multiplayer
{
    /// <summary>
    /// Talks to the authoritative game server over a WebSocket. Reconnects automatically with backoff and resumes the
    /// same player identity (id + token), so a short network drop does not lose the match.
    /// </summary>
    public sealed class OnlineMultiplayerService : MultiplayerServiceBase
    {
        static readonly float[] RetryDelays = { 0.5f, 1f, 2f, 3f, 4f, 5f, 5f, 5f };
        const float PingInterval = 5f;
        const int MaxPending = 32;

        readonly IWebSocket socket;
        readonly string url;
        readonly Func<HelloMsg> helloFactory;
        readonly Queue<string> pending = new Queue<string>();

        bool wanted;
        bool everConnected;
        bool welcomed;
        int attempt;
        float retryAt = -1f;
        float pingTimer;

        public override bool IsLocal => false;
        public string Token { get; private set; }

        /// <summary>Raised after a welcome so the identity can be stored for a page reload.</summary>
        public event Action<string, string> IdentityChanged;

        public OnlineMultiplayerService(IWebSocket socket, string url, Func<HelloMsg> helloFactory, string resumeId, string resumeToken)
        {
            this.socket = socket;
            this.url = url;
            this.helloFactory = helloFactory;
            LocalPlayerId = resumeId;
            Token = resumeToken;
            socket.Opened += OnOpened;
            socket.MessageReceived += OnMessage;
            socket.Closed += OnClosed;
        }

        public override void Connect()
        {
            wanted = true;
            if (Status == ConnectionStatus.Connected || Status == ConnectionStatus.Connecting) return;
            attempt = 0;
            OpenSocket(ConnectionStatus.Connecting);
        }

        void OpenSocket(ConnectionStatus status)
        {
            welcomed = false;
            retryAt = -1f;
            SetStatus(status);
            socket.Connect(url);
        }

        public override void Disconnect()
        {
            wanted = false;
            retryAt = -1f;
            pending.Clear();
            socket.Close();
            SetStatus(ConnectionStatus.Offline);
        }

        /// <summary>Sends the hello again on the open connection so the server picks up a new nickname or avatar.</summary>
        public void Reintroduce()
        {
            if (welcomed) OnOpened();
        }

        /// <summary>Forget the resumable identity (e.g. after the server reported it expired).</summary>
        public void ForgetIdentity()
        {
            LocalPlayerId = null;
            Token = null;
        }

        void OnOpened()
        {
            var hello = helloFactory();
            hello.playerId = LocalPlayerId;
            hello.token = Token;
            socket.Send(JsonUtility.ToJson(new Envelope { t = Msg.Hello, d = JsonUtility.ToJson(hello) }));
        }

        void OnClosed(int code)
        {
            welcomed = false;
            if (!wanted)
            {
                SetStatus(ConnectionStatus.Offline);
                return;
            }

            // Never reached the server: give up quickly so the menu can offer practice mode.
            int limit = everConnected ? RetryDelays.Length : 3;
            if (attempt >= limit)
            {
                SetStatus(ConnectionStatus.Failed);
                wanted = false;
                pending.Clear();
                return;
            }
            SetStatus(everConnected ? ConnectionStatus.Reconnecting : ConnectionStatus.Connecting);
            retryAt = Time.unscaledTime + RetryDelays[attempt];
            attempt++;
        }

        public override void Tick(float deltaTime)
        {
            socket.Poll();

            if (retryAt >= 0f && Time.unscaledTime >= retryAt && wanted)
            {
                OpenSocket(Status == ConnectionStatus.Reconnecting ? ConnectionStatus.Reconnecting : ConnectionStatus.Connecting);
            }

            if (welcomed)
            {
                pingTimer += deltaTime;
                if (pingTimer >= PingInterval)
                {
                    pingTimer = 0f;
                    SendRaw(Msg.Ping, new EmptyMsg());
                }
            }
        }

        protected override void Send(string type, object payload)
        {
            if (welcomed)
            {
                SendRaw(type, payload);
                return;
            }
            if (wanted && pending.Count < MaxPending)
            {
                pending.Enqueue(Wrap(type, payload));
                return;
            }
            RaiseError(new ErrorMsg { code = "OFFLINE", message = "NO CONNECTION" });
        }

        static string Wrap(string type, object payload)
        {
            return JsonUtility.ToJson(new Envelope { t = type, d = payload != null ? JsonUtility.ToJson(payload) : "{}" });
        }

        void SendRaw(string type, object payload)
        {
            socket.Send(Wrap(type, payload));
        }

        void OnMessage(string text)
        {
            Envelope env;
            try
            {
                env = JsonUtility.FromJson<Envelope>(text);
            }
            catch (Exception)
            {
                Debug.LogWarning("[Net] Malformed message from server.");
                return;
            }
            if (env == null || string.IsNullOrEmpty(env.t)) return;

            try
            {
                switch (env.t)
                {
                    case Msg.Welcome:
                        {
                            var w = JsonUtility.FromJson<WelcomeMsg>(env.d);
                            LocalPlayerId = w.playerId;
                            Token = w.token;
                            welcomed = true;
                            everConnected = true;
                            attempt = 0;
                            pingTimer = 0f;
                            IdentityChanged?.Invoke(LocalPlayerId, Token);
                            SetStatus(ConnectionStatus.Connected);
                            while (pending.Count > 0) socket.Send(pending.Dequeue());
                            break;
                        }
                    case Msg.Room: RaiseRoom(JsonUtility.FromJson<RoomSnapshot>(env.d)); break;
                    case Msg.Match: RaiseMatch(JsonUtility.FromJson<MatchSnapshot>(env.d)); break;
                    case Msg.QueueStatus: RaiseQueue(JsonUtility.FromJson<QueueStatusMsg>(env.d)); break;
                    case Msg.MatchFound: RaiseMatchFound(JsonUtility.FromJson<MatchFoundMsg>(env.d)); break;
                    case Msg.Left: RaiseLeft(JsonUtility.FromJson<LeftMsg>(env.d)); break;
                    case Msg.Error:
                        {
                            var e = JsonUtility.FromJson<ErrorMsg>(env.d);
                            if (e.code == ErrorCodes.SessionExpired) ForgetIdentity();
                            RaiseError(e);
                            break;
                        }
                    case Msg.Pong:
                        break;
                }
            }
            catch (Exception e)
            {
                // A broken message must never break the game loop.
                Debug.LogWarning("[Net] Could not handle '" + env.t + "': " + e.Message);
            }
        }
    }
}
