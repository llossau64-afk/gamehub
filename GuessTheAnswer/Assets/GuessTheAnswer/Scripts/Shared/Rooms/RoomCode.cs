using System.Text;

namespace GuessTheAnswer.Shared
{
    /// <summary>
    /// Six-character, uppercase room codes. The alphabet leaves out the look-alike characters 0/O and 1/I.
    /// </summary>
    public static class RoomCode
    {
        public const int Length = 6;
        public const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        public static string Generate(IRandom rng)
        {
            var sb = new StringBuilder(Length);
            for (int i = 0; i < Length; i++) sb.Append(Alphabet[rng.Next(Alphabet.Length)]);
            return sb.ToString();
        }

        public static bool IsAllowedChar(char c)
        {
            return Alphabet.IndexOf(char.ToUpperInvariant(c)) >= 0;
        }

        /// <summary>Uppercases and strips spaces and dashes. Returns null when the result is not a well-formed code.</summary>
        public static string Normalize(string input)
        {
            if (string.IsNullOrEmpty(input)) return null;
            var sb = new StringBuilder(Length);
            foreach (char raw in input)
            {
                if (raw == ' ' || raw == '-') continue;
                char c = char.ToUpperInvariant(raw);
                if (Alphabet.IndexOf(c) < 0) return null;
                sb.Append(c);
            }
            return sb.Length == Length ? sb.ToString() : null;
        }
    }
}
