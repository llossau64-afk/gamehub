using System.Collections.Generic;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Server
{
    /// <summary>
    /// Public matchmaking queues for 1v1 and 2v2. Players who wait long in the 2v2 queue are also matched
    /// into 1v1 games ("expanding search"), and after a short wait a player may fill the free seats with bots.
    /// </summary>
    public sealed class Matchmaker
    {
        public const double ExpandAfterSeconds = 30.0;
        public const double BotsAvailableAfterSeconds = 15.0;

        sealed class Ticket
        {
            public PlayerSession Session;
            public QueueKind Mode;
            public double Since;
            public bool Expanded;
        }

        readonly List<Ticket> tickets = new List<Ticket>();
        double lastStatusAt;

        /// <summary>Creates the public room for the given players (bots fill the rest). Implemented by the hub.</summary>
        public delegate void CreateMatch(List<PlayerSession> players, QueueKind mode, double now);

        public int Count => tickets.Count;

        public void Enqueue(PlayerSession session, QueueKind mode, double now)
        {
            Remove(session);
            tickets.Add(new Ticket { Session = session, Mode = mode, Since = now });
            session.InQueue = true;
            lastStatusAt = 0;
        }

        public bool Remove(PlayerSession session)
        {
            for (int i = 0; i < tickets.Count; i++)
            {
                if (tickets[i].Session != session) continue;
                tickets.RemoveAt(i);
                session.InQueue = false;
                lastStatusAt = 0;
                return true;
            }
            return false;
        }

        /// <summary>The player asked to start now with bots: everyone waiting in the same queue joins them.</summary>
        public bool FillWithBots(PlayerSession session, double now, CreateMatch create)
        {
            Ticket mine = Find(session);
            if (mine == null || now - mine.Since < BotsAvailableAfterSeconds) return false;
            int capacity = mine.Mode == QueueKind.TwoVsTwo ? 4 : 2;
            var group = new List<PlayerSession> { session };
            foreach (var t in tickets)
            {
                if (group.Count >= capacity) break;
                if (t != mine && t.Mode == mine.Mode) group.Add(t.Session);
            }
            foreach (var s in group) Remove(s);
            create(group, mine.Mode, now);
            return true;
        }

        Ticket Find(PlayerSession session)
        {
            foreach (var t in tickets) if (t.Session == session) return t;
            return null;
        }

        public void Tick(double now, CreateMatch create, System.Action<PlayerSession, QueueStatusMsg> sendStatus)
        {
            // Drop tickets of players who went away.
            for (int i = tickets.Count - 1; i >= 0; i--)
            {
                if (!tickets[i].Session.IsConnected)
                {
                    tickets[i].Session.InQueue = false;
                    tickets.RemoveAt(i);
                }
            }

            foreach (var t in tickets)
            {
                if (t.Mode == QueueKind.TwoVsTwo && !t.Expanded && now - t.Since >= ExpandAfterSeconds) t.Expanded = true;
            }

            // 2v2: four players in arrival order.
            while (true)
            {
                var four = Take(QueueKind.TwoVsTwo, 4, false);
                if (four == null) break;
                create(four, QueueKind.TwoVsTwo, now);
            }

            // 1v1: two players from the 1v1 queue or from expanded 2v2 searches.
            while (true)
            {
                var two = Take(QueueKind.OneVsOne, 2, true);
                if (two == null) break;
                create(two, QueueKind.OneVsOne, now);
            }

            if (now - lastStatusAt >= 1.0)
            {
                lastStatusAt = now;
                int waiting1 = 0, waiting2 = 0;
                foreach (var t in tickets)
                {
                    if (t.Mode == QueueKind.TwoVsTwo) waiting2++;
                    else waiting1++;
                }
                foreach (var t in tickets)
                {
                    int needed = t.Mode == QueueKind.TwoVsTwo ? 4 : 2;
                    int found = t.Mode == QueueKind.TwoVsTwo ? waiting2 : waiting1;
                    sendStatus(t.Session, new QueueStatusMsg
                    {
                        mode = (int)t.Mode,
                        found = System.Math.Min(found, needed - 1),
                        needed = needed,
                        elapsed = (float)(now - t.Since),
                        expanded = t.Expanded,
                        botsAvailable = now - t.Since >= BotsAvailableAfterSeconds,
                        searching = true,
                    });
                }
            }
        }

        List<PlayerSession> Take(QueueKind mode, int count, bool includeExpanded)
        {
            var picked = new List<Ticket>(count);
            foreach (var t in tickets)
            {
                if (t.Mode == mode || (includeExpanded && t.Expanded)) picked.Add(t);
                if (picked.Count == count) break;
            }
            if (picked.Count < count) return null;
            var result = new List<PlayerSession>(count);
            foreach (var t in picked)
            {
                tickets.Remove(t);
                t.Session.InQueue = false;
                result.Add(t.Session);
            }
            lastStatusAt = 0;
            return result;
        }
    }
}
