using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace GuessTheAnswer.Server
{
    /// <summary>
    /// One WebSocket. Outgoing frames go through a bounded queue drained by a single writer task,
    /// so game logic never blocks on a slow client.
    /// </summary>
    public sealed class ClientConnection
    {
        public const int MaxMessageBytes = 8 * 1024;
        const int SendQueueLimit = 512;
        const int MessagesPerSecondLimit = 40;

        static int nextId;

        readonly WebSocket socket;
        readonly Channel<string> outgoing = Channel.CreateBounded<string>(new BoundedChannelOptions(SendQueueLimit)
        {
            SingleReader = true,
            FullMode = BoundedChannelFullMode.Wait,
        });
        readonly CancellationTokenSource cts = new CancellationTokenSource();

        int rateWindowStart = Environment.TickCount;
        int rateCount;

        public int Id { get; } = Interlocked.Increment(ref nextId);
        public PlayerSession Session { get; set; }
        public bool IsOpen => socket.State == WebSocketState.Open && !cts.IsCancellationRequested;

        public ClientConnection(WebSocket socket)
        {
            this.socket = socket;
        }

        /// <summary>Queues a frame. Returns false (and closes the socket) when the client cannot keep up.</summary>
        public bool Send(string text)
        {
            if (!IsOpen) return false;
            if (outgoing.Writer.TryWrite(text)) return true;
            Close();
            return false;
        }

        public void Close()
        {
            if (cts.IsCancellationRequested) return;
            cts.Cancel();
            outgoing.Writer.TryComplete();
        }

        /// <summary>Simple flood protection.</summary>
        public bool AllowMessage()
        {
            int now = Environment.TickCount;
            if (now - rateWindowStart > 1000)
            {
                rateWindowStart = now;
                rateCount = 0;
            }
            return ++rateCount <= MessagesPerSecondLimit;
        }

        public async Task RunAsync(Func<ClientConnection, string, Task> onMessage, CancellationToken shutdown)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cts.Token, shutdown);
            var writer = WriteLoopAsync(linked.Token);
            var buffer = new byte[4096];
            var message = new StringBuilder();
            var decoder = Encoding.UTF8.GetDecoder();
            var chars = new char[4096];
            int total = 0;

            try
            {
                while (socket.State == WebSocketState.Open && !linked.IsCancellationRequested)
                {
                    var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), linked.Token);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    if (result.MessageType != WebSocketMessageType.Text) continue;

                    total += result.Count;
                    if (total > MaxMessageBytes) break;
                    int n = decoder.GetChars(buffer, 0, result.Count, chars, 0, result.EndOfMessage);
                    message.Append(chars, 0, n);

                    if (result.EndOfMessage)
                    {
                        string text = message.ToString();
                        message.Clear();
                        total = 0;
                        await onMessage(this, text);
                    }
                }
            }
            catch (OperationCanceledException)
            {
            }
            catch (WebSocketException)
            {
            }
            finally
            {
                Close();
                try { await writer; } catch { /* the writer ends with the socket */ }
                if (socket.State == WebSocketState.Open || socket.State == WebSocketState.CloseReceived)
                {
                    try
                    {
                        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", timeout.Token);
                    }
                    catch
                    {
                        // The peer is already gone.
                    }
                }
            }
        }

        async Task WriteLoopAsync(CancellationToken token)
        {
            try
            {
                while (await outgoing.Reader.WaitToReadAsync(token))
                {
                    while (outgoing.Reader.TryRead(out var text))
                    {
                        var bytes = Encoding.UTF8.GetBytes(text);
                        await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token);
                    }
                }
            }
            catch (OperationCanceledException)
            {
            }
            catch (WebSocketException)
            {
                Close();
            }
            catch (ChannelClosedException)
            {
            }
        }
    }
}
