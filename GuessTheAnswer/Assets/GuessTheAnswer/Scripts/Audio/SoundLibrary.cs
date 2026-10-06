using System.Collections;
using UnityEngine;

namespace GuessTheAnswer.Audio
{
    public enum Sfx
    {
        Click,
        Hover,
        Correct,
        Wrong,
        TimerTick,
        TimerWarning,
        RoundStart,
        ScoreGain,
        Joker,
        PlayerJoin,
        PlayerLeave,
        MatchFound,
        Victory,
        Defeat,
        Countdown,
        Go,
        Whoosh,
        Steal,
        Error,
        Lock,
    }

    public enum MusicTrack
    {
        None,
        Menu,
        Game,
    }

    /// <summary>
    /// Builds every sound. A clip placed at Resources/GTA/Audio/&lt;Name&gt; (e.g. "Correct" or "Music_Menu")
    /// replaces the generated one, so real recordings can be dropped in later without code changes.
    /// </summary>
    public static class SoundLibrary
    {
        public static AudioClip Load(Sfx sfx)
        {
            var custom = Resources.Load<AudioClip>("GTA/Audio/" + sfx);
            if (custom != null) return custom;
            var b = Build(sfx);
            b.Normalize(PeakFor(sfx));
            return b.ToClip("sfx_" + sfx);
        }

        static float PeakFor(Sfx sfx)
        {
            switch (sfx)
            {
                case Sfx.Hover: return 0.25f;
                case Sfx.Click: return 0.55f;
                case Sfx.TimerTick: return 0.45f;
                default: return 0.8f;
            }
        }

        static SynthBuffer Build(Sfx sfx)
        {
            SynthBuffer b;
            switch (sfx)
            {
                case Sfx.Click:
                    b = new SynthBuffer(0.06f);
                    b.Tone(0f, 0.05f, 1400f, 1f, Wave.Sine, 0.001f, 70f, 900f);
                    b.Noise(0f, 0.01f, 0.25f, 0.5f, 0.2f, 0.001f, 300f);
                    return b;
                case Sfx.Hover:
                    b = new SynthBuffer(0.04f);
                    b.Tone(0f, 0.035f, 2200f, 1f, Wave.Sine, 0.002f, 90f);
                    return b;
                case Sfx.Correct:
                    b = new SynthBuffer(0.55f);
                    b.Tone(0.00f, 0.25f, SynthBuffer.NoteHz(84), 0.6f, Wave.Sine, 0.003f, 9f, -1f, 0f, 0.3f);
                    b.Tone(0.08f, 0.30f, SynthBuffer.NoteHz(88), 0.6f, Wave.Sine, 0.003f, 8f, -1f, 0f, 0.3f);
                    b.Tone(0.16f, 0.38f, SynthBuffer.NoteHz(91), 0.7f, Wave.Sine, 0.003f, 6f, -1f, 0f, 0.3f);
                    return b;
                case Sfx.Wrong:
                    b = new SynthBuffer(0.42f);
                    b.Tone(0.00f, 0.18f, 330f, 0.6f, Wave.Square, 0.004f, 10f, 300f);
                    b.Tone(0.16f, 0.26f, 247f, 0.6f, Wave.Square, 0.004f, 8f, 200f);
                    return b;
                case Sfx.TimerTick:
                    b = new SynthBuffer(0.05f);
                    b.Tone(0f, 0.045f, 1050f, 1f, Wave.Triangle, 0.001f, 80f);
                    return b;
                case Sfx.TimerWarning:
                    b = new SynthBuffer(0.2f);
                    b.Tone(0f, 0.08f, 1568f, 1f, Wave.Triangle, 0.001f, 40f);
                    b.Tone(0.1f, 0.08f, 1568f, 0.7f, Wave.Triangle, 0.001f, 40f);
                    return b;
                case Sfx.RoundStart:
                    b = new SynthBuffer(0.6f);
                    b.Noise(0f, 0.3f, 0.5f, 0.02f, 0.4f, 0.15f, 8f);
                    b.Tone(0.22f, 0.35f, SynthBuffer.NoteHz(79), 0.7f, Wave.Sine, 0.004f, 7f, -1f, 0f, 0.4f);
                    b.Tone(0.30f, 0.30f, SynthBuffer.NoteHz(86), 0.5f, Wave.Sine, 0.004f, 7f, -1f, 0f, 0.3f);
                    return b;
                case Sfx.ScoreGain:
                    b = new SynthBuffer(0.4f);
                    for (int i = 0; i < 4; i++) b.Tone(i * 0.05f, 0.18f, SynthBuffer.NoteHz(88 + i * 3), 0.45f, Wave.Sine, 0.002f, 14f);
                    return b;
                case Sfx.Joker:
                    b = new SynthBuffer(0.45f);
                    b.Tone(0f, 0.4f, 520f, 0.7f, Wave.Triangle, 0.01f, 5f, 1400f, 0.03f);
                    b.Noise(0f, 0.35f, 0.15f, 0.1f, 0.6f, 0.05f, 8f);
                    return b;
                case Sfx.PlayerJoin:
                    b = new SynthBuffer(0.3f);
                    b.Tone(0f, 0.14f, SynthBuffer.NoteHz(76), 0.6f, Wave.Sine, 0.003f, 14f);
                    b.Tone(0.09f, 0.2f, SynthBuffer.NoteHz(83), 0.6f, Wave.Sine, 0.003f, 12f);
                    return b;
                case Sfx.PlayerLeave:
                    b = new SynthBuffer(0.3f);
                    b.Tone(0f, 0.14f, SynthBuffer.NoteHz(79), 0.6f, Wave.Sine, 0.003f, 14f);
                    b.Tone(0.09f, 0.2f, SynthBuffer.NoteHz(72), 0.6f, Wave.Sine, 0.003f, 12f);
                    return b;
                case Sfx.MatchFound:
                    b = new SynthBuffer(0.8f);
                    b.Tone(0.00f, 0.2f, SynthBuffer.NoteHz(72), 0.5f, Wave.Triangle, 0.004f, 8f);
                    b.Tone(0.12f, 0.2f, SynthBuffer.NoteHz(76), 0.5f, Wave.Triangle, 0.004f, 8f);
                    b.Tone(0.24f, 0.55f, SynthBuffer.NoteHz(79), 0.6f, Wave.Triangle, 0.004f, 4f, -1f, 0.01f);
                    b.Tone(0.24f, 0.55f, SynthBuffer.NoteHz(84), 0.4f, Wave.Sine, 0.004f, 4f);
                    return b;
                case Sfx.Victory:
                    b = new SynthBuffer(1.5f);
                    int[] up = { 72, 76, 79, 84 };
                    for (int i = 0; i < up.Length; i++) b.Tone(i * 0.11f, 0.3f, SynthBuffer.NoteHz(up[i]), 0.5f, Wave.Triangle, 0.004f, 7f, -1f, 0f, 0.25f);
                    b.Tone(0.45f, 1.0f, SynthBuffer.NoteHz(84), 0.5f, Wave.Triangle, 0.01f, 2.5f, -1f, 0.012f, 0.3f);
                    b.Tone(0.45f, 1.0f, SynthBuffer.NoteHz(88), 0.35f, Wave.Sine, 0.01f, 2.5f);
                    b.Tone(0.45f, 1.0f, SynthBuffer.NoteHz(91), 0.35f, Wave.Sine, 0.01f, 2.5f);
                    return b;
                case Sfx.Defeat:
                    b = new SynthBuffer(1.2f);
                    int[] down = { 72, 70, 67, 63 };
                    for (int i = 0; i < down.Length; i++) b.Tone(i * 0.2f, i == 3 ? 0.6f : 0.25f, SynthBuffer.NoteHz(down[i]), 0.5f, Wave.Triangle, 0.006f, i == 3 ? 3f : 7f);
                    return b;
                case Sfx.Countdown:
                    b = new SynthBuffer(0.2f);
                    b.Tone(0f, 0.16f, 880f, 0.8f, Wave.Triangle, 0.002f, 16f);
                    return b;
                case Sfx.Go:
                    b = new SynthBuffer(0.45f);
                    b.Tone(0f, 0.4f, 1320f, 0.7f, Wave.Triangle, 0.002f, 6f);
                    b.Tone(0f, 0.4f, 1760f, 0.35f, Wave.Sine, 0.002f, 6f);
                    return b;
                case Sfx.Whoosh:
                    b = new SynthBuffer(0.3f);
                    b.Noise(0f, 0.28f, 0.7f, 0.03f, 0.25f, 0.1f, 9f);
                    return b;
                case Sfx.Steal:
                    b = new SynthBuffer(0.4f);
                    b.Tone(0f, 0.12f, 1800f, 0.6f, Wave.Saw, 0.002f, 20f, 600f);
                    b.Tone(0.1f, 0.25f, SynthBuffer.NoteHz(81), 0.5f, Wave.Triangle, 0.003f, 8f);
                    return b;
                case Sfx.Error:
                    b = new SynthBuffer(0.25f);
                    b.Tone(0f, 0.1f, 220f, 0.6f, Wave.Square, 0.003f, 18f);
                    b.Tone(0.11f, 0.12f, 196f, 0.6f, Wave.Square, 0.003f, 18f);
                    return b;
                case Sfx.Lock:
                    b = new SynthBuffer(0.12f);
                    b.Tone(0f, 0.1f, 660f, 0.8f, Wave.Triangle, 0.001f, 30f, 520f);
                    b.Noise(0f, 0.02f, 0.3f, 0.6f, 0.2f, 0.001f, 200f);
                    return b;
                default:
                    return new SynthBuffer(0.05f);
            }
        }

        // ───────────────────────── Music ─────────────────────────

        /// <summary>Renders a music loop in small steps (a coroutine) so loading never stalls a frame.</summary>
        public static IEnumerator BuildMusic(MusicTrack track, System.Action<AudioClip> done)
        {
            var custom = Resources.Load<AudioClip>("GTA/Audio/Music_" + track);
            if (custom != null)
            {
                done(custom);
                yield break;
            }

            bool game = track == MusicTrack.Game;
            float bpm = game ? 118f : 92f;
            float beat = 60f / bpm;
            const int bars = 8;
            var b = new SynthBuffer(bars * 4 * beat, wrap: true);

            // Chord roots (MIDI) and qualities per bar.
            int[] roots = game ? new[] { 57, 53, 48, 55, 57, 53, 48, 55 } : new[] { 48, 45, 41, 43, 48, 45, 41, 43 };
            int[][] chords = game
                ? new[] { new[] { 0, 3, 7 }, new[] { 0, 4, 7 }, new[] { 0, 4, 7 }, new[] { 0, 4, 7 }, new[] { 0, 3, 7 }, new[] { 0, 4, 7 }, new[] { 0, 4, 7 }, new[] { 0, 4, 7 } }
                : new[] { new[] { 0, 4, 7, 11 }, new[] { 0, 3, 7, 10 }, new[] { 0, 4, 7, 11 }, new[] { 0, 4, 7, 10 }, new[] { 0, 4, 7, 11 }, new[] { 0, 3, 7, 10 }, new[] { 0, 4, 7, 11 }, new[] { 0, 4, 7, 10 } };

            for (int bar = 0; bar < bars; bar++)
            {
                float barStart = bar * 4 * beat;
                int root = roots[bar];
                int[] chord = chords[bar];

                // Soft pad.
                foreach (int interval in chord)
                {
                    b.Tone(barStart, 4 * beat + 0.2f, SynthBuffer.NoteHz(root + 12 + interval), game ? 0.05f : 0.07f, Wave.Triangle, 0.35f, 0.5f, -1f, 0.003f);
                }

                // Bass.
                if (game)
                {
                    for (int e = 0; e < 8; e++)
                        b.Tone(barStart + e * beat * 0.5f, beat * 0.45f, SynthBuffer.NoteHz(root - 12 + (e == 6 ? 7 : 0)), 0.22f, Wave.Triangle, 0.004f, 5f);
                }
                else
                {
                    b.Tone(barStart, beat * 1.8f, SynthBuffer.NoteHz(root - 12), 0.2f, Wave.Sine, 0.01f, 1.2f);
                    b.Tone(barStart + 2 * beat, beat * 1.8f, SynthBuffer.NoteHz(root - 12 + 7), 0.16f, Wave.Sine, 0.01f, 1.2f);
                }

                // Pluck arpeggio.
                int steps = game ? 8 : 8;
                for (int s = 0; s < steps; s++)
                {
                    int note = root + 24 + chord[(s * (game ? 1 : 2) + bar) % chord.Length];
                    if (!game && s % 2 == 1) note += 12;
                    b.Tone(barStart + s * beat * 0.5f, beat * 0.5f, SynthBuffer.NoteHz(note), game ? 0.07f : 0.06f, Wave.Sine, 0.002f, game ? 9f : 6f, -1f, 0f, 0.2f);
                }

                // Light percussion for the in-game loop.
                if (game)
                {
                    for (int q = 0; q < 4; q++)
                    {
                        float t = barStart + q * beat;
                        b.Tone(t, 0.18f, 110f, 0.28f, Wave.Sine, 0.001f, 18f, 45f);
                        b.Noise(t + beat * 0.5f, 0.05f, 0.06f, 0.7f, 0.7f, 0.001f, 60f);
                        if (q % 2 == 1) b.Noise(t, 0.12f, 0.1f, 0.35f, 0.2f, 0.001f, 25f);
                    }
                }
                yield return null;
            }

            b.Normalize(0.75f);
            done(b.ToClip("music_" + track));
        }
    }
}
