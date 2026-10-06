using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;

namespace GuessTheAnswer.Multiplayer
{
    /// <summary>A text WebSocket. Events are raised on the Unity main thread (from <see cref="Poll"/> or SendMessage).</summary>
    public interface IWebSocket
    {
        bool IsOpen { get; }
        event Action Opened;
        event Action<string> MessageReceived;
        event Action<int> Closed;
        void Connect(string url);
        void Send(string text);
        void Close();
        void Poll();
    }

    public static class WebSocketFactory
    {
        public static IWebSocket Create(Transform parent)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            var go = new GameObject("[GTA] BrowserSocket");
            go.transform.SetParent(parent, false);
            return go.AddComponent<BrowserWebSocket>();
#else
            return new NativeWebSocket();
#endif
        }
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    /// <summary>The browser's WebSocket through GuessTheAnswerBrowser.jslib (WebGL has no sockets in C#).</summary>
    public sealed class BrowserWebSocket : MonoBehaviour, IWebSocket
    {
        [DllImport("__Internal")] static extern int GTA_WS_Connect(string url, string target);
        [DllImport("__Internal")] static extern int GTA_WS_Send(int id, string text);
        [DllImport("__Internal")] static extern void GTA_WS_Close(int id);

        int socketId;
        bool open;

        public bool IsOpen => open;
        public event Action Opened;
        public event Action<string> MessageReceived;
        public event Action<int> Closed;

        void Awake()
        {
            // SendMessage needs a unique object name.
            gameObject.name = "[GTA] BrowserSocket " + GetInstanceID();
        }

        public void Connect(string url)
        {
            if (socketId != 0) GTA_WS_Close(socketId);
            open = false;
            socketId = GTA_WS_Connect(url, gameObject.name);
        }

        public void Send(string text)
        {
            if (open) GTA_WS_Send(socketId, text);
        }

        public void Close()
        {
            if (socketId != 0) GTA_WS_Close(socketId);
        }

        public void Poll() { }

        static bool Split(string value, out int id, out string rest)
        {
            int bar = value.IndexOf('|');
            string head = bar < 0 ? value : value.Substring(0, bar);
            rest = bar < 0 ? string.Empty : value.Substring(bar + 1);
            return int.TryParse(head, out id);
        }

        // Callbacks from JavaScript. Events of an older socket (after a reconnect) are ignored.
        public void OnSocketOpen(string value)
        {
            if (!Split(value, out int id, out _) || id != socketId) return;
            open = true;
            Opened?.Invoke();
        }

        public void OnSocketMessage(string value)
        {
            if (!Split(value, out int id, out string text) || id != socketId) return;
            MessageReceived?.Invoke(text);
        }

        public void OnSocketError(string value)
        {
        }

        public void OnSocketClose(string value)
        {
            if (!Split(value, out int id, out string code) || id != socketId) return;
            open = false;
            socketId = 0;
            int.TryParse(code, out int c);
            Closed?.Invoke(c);
        }
    }
#endif

#if !UNITY_WEBGL || UNITY_EDITOR
    /// <summary>System.Net.WebSockets for the editor and desktop builds. A background task receives; Poll() delivers.</summary>
    public sealed class NativeWebSocket : IWebSocket
    {
        System.Net.WebSockets.ClientWebSocket socket;
        System.Threading.CancellationTokenSource cts;
        readonly ConcurrentQueue<Action> events = new ConcurrentQueue<Action>();
        readonly object sendLock = new object();
        readonly Queue<string> sendQueue = new Queue<string>();
        bool sending;
        volatile bool open;

        public bool IsOpen => open;
        public event Action Opened;
        public event Action<string> MessageReceived;
        public event Action<int> Closed;

        public void Connect(string url)
        {
            Close();
            var s = new System.Net.WebSockets.ClientWebSocket();
            var token = new System.Threading.CancellationTokenSource();
            socket = s;
            cts = token;
            RunAsync(s, token, url);
        }

        async void RunAsync(System.Net.WebSockets.ClientWebSocket s, System.Threading.CancellationTokenSource token, string url)
        {
            int closeCode = 1006;
            try
            {
                await s.ConnectAsync(new Uri(url), token.Token).ConfigureAwait(false);
                open = true;
                events.Enqueue(() => Opened?.Invoke());

                var buffer = new byte[16 * 1024];
                var sb = new System.Text.StringBuilder();
                while (s.State == System.Net.WebSockets.WebSocketState.Open && !token.IsCancellationRequested)
                {
                    var result = await s.ReceiveAsync(new ArraySegment<byte>(buffer), token.Token).ConfigureAwait(false);
                    if (result.MessageType == System.Net.WebSockets.WebSocketMessageType.Close)
                    {
                        closeCode = (int)(result.CloseStatus ?? System.Net.WebSockets.WebSocketCloseStatus.NormalClosure);
                        break;
                    }
                    sb.Append(System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count));
                    if (!result.EndOfMessage) continue;
                    string text = sb.ToString();
                    sb.Clear();
                    events.Enqueue(() => MessageReceived?.Invoke(text));
                }
            }
            catch (Exception)
            {
                // Connection refused, network gone or closed by us: reported as a close below.
            }
            finally
            {
                open = false;
                if (socket == s)
                {
                    int code = closeCode;
                    events.Enqueue(() => Closed?.Invoke(code));
                }
                s.Dispose();
            }
        }

        public void Send(string text)
        {
            if (!open) return;
            lock (sendLock)
            {
                sendQueue.Enqueue(text);
                if (sending) return;
                sending = true;
            }
            SendLoop(socket);
        }

        async void SendLoop(System.Net.WebSockets.ClientWebSocket s)
        {
            while (true)
            {
                string next;
                lock (sendLock)
                {
                    if (sendQueue.Count == 0)
                    {
                        sending = false;
                        return;
                    }
                    next = sendQueue.Dequeue();
                }
                try
                {
                    var bytes = System.Text.Encoding.UTF8.GetBytes(next);
                    await s.SendAsync(new ArraySegment<byte>(bytes), System.Net.WebSockets.WebSocketMessageType.Text, true, System.Threading.CancellationToken.None).ConfigureAwait(false);
                }
                catch (Exception)
                {
                    lock (sendLock)
                    {
                        sendQueue.Clear();
                        sending = false;
                    }
                    return;
                }
            }
        }

        public void Close()
        {
            var s = socket;
            socket = null;
            open = false;
            if (cts != null)
            {
                cts.Cancel();
                cts = null;
            }
            lock (sendLock) sendQueue.Clear();
            if (s != null) events.Enqueue(() => Closed?.Invoke(1000));
        }

        public void Poll()
        {
            while (events.TryDequeue(out var e)) e();
        }
    }
#endif
}
