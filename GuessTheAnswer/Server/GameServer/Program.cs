using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace GuessTheAnswer.Server
{
    public static class Program
    {
        public static void Main(string[] args)
        {
            var app = Build(args, out _);
            app.Run();
        }

        /// <summary>Builds the web app. Used by Main and by the integration tests.</summary>
        public static WebApplication Build(string[] args, out GameHub hub, string urls = null)
        {
            var builder = WebApplication.CreateBuilder(args);
            string port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
            builder.WebHost.UseUrls(urls ?? ("http://0.0.0.0:" + port));
            builder.Logging.SetMinimumLevel(LogLevel.Warning);

            var app = builder.Build();
            Action<string> log = message => Console.WriteLine(DateTime.UtcNow.ToString("HH:mm:ss") + " " + message);

            string dataDir = Environment.GetEnvironmentVariable("GTA_DATA_DIR") ?? Path.Combine(AppContext.BaseDirectory, "Data");
            var bank = QuestionLoader.Load(dataDir, log);
            var gameHub = new GameHub(bank, log);
            hub = gameHub;

            app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });

            app.MapGet("/", () => "Guess the Answer game server");
            app.MapGet("/health", () =>
            {
                var (sessions, rooms, queued) = gameHub.Stats();
                return Results.Json(new { status = "ok", sessions, rooms, queued });
            });

            app.Map("/ws", async (HttpContext context) =>
            {
                if (!context.WebSockets.IsWebSocketRequest)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    return;
                }
                using var socket = await context.WebSockets.AcceptWebSocketAsync();
                var connection = new ClientConnection(socket);
                await gameHub.HandleConnectionAsync(connection, context.RequestAborted);
            });

            // 10 ticks per second drive every room's timers, the bots and matchmaking.
            var lifetime = app.Lifetime;
            var ticker = new Thread(() =>
            {
                var token = lifetime.ApplicationStopping;
                while (!token.IsCancellationRequested)
                {
                    gameHub.Tick();
                    token.WaitHandle.WaitOne(100);
                }
            })
            { IsBackground = true, Name = "GameTick" };
            lifetime.ApplicationStarted.Register(() => ticker.Start());

            return app;
        }
    }
}
