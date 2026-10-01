using System;
using BarberSimulator.Economy;
using BarberSimulator.Save;
using BarberSimulator.Shop;
using UnityEngine;

namespace BarberSimulator.Workday
{
    /// <summary>Where the shop is in its working day. Stored as an int in <see cref="ProgressionData.dayPhase"/>.</summary>
    public enum DayPhase
    {
        /// <summary>Before opening: the clock is frozen at opening time until the player flips the sign.</summary>
        Closed = 0,
        /// <summary>Customers are welcome and the clock runs.</summary>
        Open = 1,
        /// <summary>Closing time passed: no new customers, the ones inside finish.</summary>
        Closing = 2,
        /// <summary>Everybody left and the rent is paid; the summary is waiting for the player.</summary>
        Ended = 3
    }

    /// <summary>What the end-of-day screen shows.</summary>
    public struct DaySummary
    {
        public int Day;
        public int CustomersServed;
        public int CustomersLost;
        public int Revenue;
        public int Tips;
        public float AverageStars;
        public float ReputationChange;
        public int XpEarned;
        public int Rent;
        public int LevelBefore;
        public int LevelAfter;
        public int Earnings => Revenue + Tips;
        public int Net => Earnings - Rent;
    }

    /// <summary>
    /// The working day: an in-game clock from opening to closing time, the open/closed state of the shop, the
    /// closing sequence and the end-of-day settlement. All state lives in the save, so the day survives reloads.
    /// The clock only runs while the shop is open (preparing before opening costs no time).
    /// </summary>
    public sealed class DayCycleService
    {
        private readonly WorkdayConfig _config;
        private readonly SaveService _save;
        private readonly EconomyService _economy;
        private readonly ShopProgression _progression;
        private int _lastClockMinute = -1;
        private float _closingTimer;
        private bool _sentHome;

        /// <summary>Gameplay clock runs only while this is true (set by the flow controller).</summary>
        public bool Running { get; set; }
        /// <summary>Extra condition for opening (the tutorial asks the player to finish tidying first).</summary>
        public Func<bool> OpenGate { get; set; }
        /// <summary>Number of customers currently inside or on their way; the day ends when it reaches zero after closing.</summary>
        public Func<int> ActiveCustomers { get; set; }

        public DayPhase Phase => (DayPhase)_save.Data.progression.dayPhase;
        public int Day => _save.Data.progression.day;
        public float ClockMinutes => _save.Data.progression.dayClockMinutes;
        public bool IsAcceptingCustomers => Phase == DayPhase.Open;
        public bool IsOpenGateClear => OpenGate == null || OpenGate();
        public bool CanOpen => Phase == DayPhase.Closed && IsOpenGateClear;
        public float DayProgress01 => Mathf.InverseLerp(_config.OpeningMinutes, _config.ClosingMinutes, ClockMinutes);

        public string ClockText
        {
            get
            {
                int minutes = Mathf.FloorToInt(ClockMinutes);
                return (minutes / 60).ToString("00") + ":" + (minutes % 60).ToString("00");
            }
        }

        /// <summary>(oldPhase, newPhase)</summary>
        public event Action<DayPhase, DayPhase> PhaseChanged;
        /// <summary>Raised whenever the displayed minute changes.</summary>
        public event Action ClockChanged;
        /// <summary>Raised when closing time has passed and waiting customers should go home.</summary>
        public event Action SendHomeRequested;
        public event Action<int> DayStarted;

        public DayCycleService(WorkdayConfig config, SaveService save, EconomyService economy, ShopProgression progression)
        {
            _config = config;
            _save = save;
            _economy = economy;
            _progression = progression;
        }

        /// <summary>Called when gameplay begins (new game, continue, return from the intro).</summary>
        public void Restore()
        {
            var progression = _save.Data.progression;
            progression.dayClockMinutes = Mathf.Clamp(progression.dayClockMinutes, _config.OpeningMinutes, _config.ClosingMinutes);
            if (progression.dayStats.reputationAtStart < 0f)
            {
                progression.dayStats.reputationAtStart = progression.reputation;
                progression.dayStats.levelAtStart = _progression.Level;
            }

            // Customers are not saved, so a day that was in its closing phase has nobody left to wait for.
            if (Phase == DayPhase.Closing && ActiveCustomers != null && ActiveCustomers() == 0) Settle();
            else if (Phase == DayPhase.Open && ClockMinutes >= _config.ClosingMinutes) SetPhase(DayPhase.Closing);
            progression.shopOpen = Phase == DayPhase.Open || Phase == DayPhase.Closing;

            _closingTimer = 0f;
            _sentHome = false;
            _lastClockMinute = -1;
            ClockChanged?.Invoke();
        }

        /// <summary>The sign was flipped. Returns false when the shop cannot open right now.</summary>
        public bool TryOpenShop()
        {
            if (!CanOpen) return false;
            _save.Data.progression.shopOpen = true;
            SetPhase(DayPhase.Open);
            return true;
        }

        public void Tick(float deltaTime)
        {
            if (!Running || deltaTime <= 0f) return;
            var progression = _save.Data.progression;

            switch (Phase)
            {
                case DayPhase.Open:
                    progression.dayClockMinutes = Mathf.Min(_config.ClosingMinutes, progression.dayClockMinutes + deltaTime * _config.GameMinutesPerSecond);
                    NotifyClock();
                    if (progression.dayClockMinutes >= _config.ClosingMinutes)
                    {
                        _closingTimer = 0f;
                        _sentHome = false;
                        SetPhase(DayPhase.Closing);
                    }
                    break;

                case DayPhase.Closing:
                    _closingTimer += deltaTime;
                    if (ActiveCustomers == null || ActiveCustomers() == 0)
                    {
                        Settle();
                    }
                    else if (!_sentHome && _closingTimer >= _config.closingGraceSeconds)
                    {
                        _sentHome = true;
                        SendHomeRequested?.Invoke();
                    }
                    break;
            }
        }

        public DaySummary BuildSummary()
        {
            var progression = _save.Data.progression;
            var stats = progression.dayStats;
            return new DaySummary
            {
                Day = progression.day,
                CustomersServed = stats.customersServed,
                CustomersLost = stats.customersLost,
                Revenue = stats.revenue,
                Tips = stats.tips,
                AverageStars = stats.customersServed > 0 ? (float)stats.starsTotal / stats.customersServed : 0f,
                ReputationChange = progression.reputation - Mathf.Max(0f, stats.reputationAtStart),
                XpEarned = stats.xpEarned,
                Rent = stats.rentCharged,
                LevelBefore = stats.levelAtStart > 0 ? stats.levelAtStart : _progression.Level,
                LevelAfter = _progression.Level
            };
        }

        /// <summary>Pays the rent (once) and moves to <see cref="DayPhase.Ended"/>.</summary>
        private void Settle()
        {
            var progression = _save.Data.progression;
            var stats = progression.dayStats;
            if (!stats.settled)
            {
                stats.settled = true;
                stats.rentCharged = _economy.Charge(_config.RentFor(progression.day, _progression.Level));
            }
            progression.shopOpen = false;
            SetPhase(DayPhase.Ended);
            _save.SaveNow();
        }

        /// <summary>Starts the next morning: day counter up, clock reset, shop closed, fresh statistics.</summary>
        public void StartNextDay()
        {
            if (Phase != DayPhase.Ended) return;
            var progression = _save.Data.progression;
            progression.day++;
            progression.dayClockMinutes = _config.OpeningMinutes;
            progression.shopOpen = false;
            progression.dayStats = new DayStatsData
            {
                reputationAtStart = progression.reputation,
                levelAtStart = _progression.Level
            };
            _lastClockMinute = -1;
            SetPhase(DayPhase.Closed);
            ClockChanged?.Invoke();
            _save.SaveNow();
            DayStarted?.Invoke(progression.day);
        }

        private void SetPhase(DayPhase next)
        {
            var previous = Phase;
            if (previous == next) return;
            _save.Data.progression.dayPhase = (int)next;
            _save.RequestSave();
            PhaseChanged?.Invoke(previous, next);
        }

        private void NotifyClock()
        {
            int minute = Mathf.FloorToInt(ClockMinutes);
            if (minute == _lastClockMinute) return;
            _lastClockMinute = minute;
            _save.RequestSave();
            ClockChanged?.Invoke();
        }
    }
}
