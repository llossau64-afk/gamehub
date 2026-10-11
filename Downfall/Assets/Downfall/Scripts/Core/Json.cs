// Minimal JSON for saves and network messages. Objects parse to Dictionary<string, object>,
// arrays to List<object>, numbers to double. Unity's JsonUtility can't do dictionaries,
// and the save format is the web build's, so it stays loose on purpose.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Downfall
{
    public static class Json
    {
        public static object Parse(string s)
        {
            if (string.IsNullOrEmpty(s)) return null;
            int i = 0;
            try { var v = Value(s, ref i); return v; } catch (Exception) { return null; }
        }

        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        static object Value(string s, ref int i)
        {
            Ws(s, ref i);
            char c = s[i];
            if (c == '{')
            {
                var d = new Dictionary<string, object>();
                i++; Ws(s, ref i);
                if (s[i] == '}') { i++; return d; }
                while (true)
                {
                    Ws(s, ref i);
                    string k = Str(s, ref i);
                    Ws(s, ref i); i++; // ':'
                    d[k] = Value(s, ref i);
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    i++; return d;
                }
            }
            if (c == '[')
            {
                var l = new List<object>();
                i++; Ws(s, ref i);
                if (s[i] == ']') { i++; return l; }
                while (true)
                {
                    l.Add(Value(s, ref i));
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    i++; return l;
                }
            }
            if (c == '"') return Str(s, ref i);
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (s.Length - i >= 5 && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static string Str(string s, ref int i)
        {
            var sb = new StringBuilder();
            i++;
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
            i++;
            return sb.ToString();
        }

        public static string Write(object v) { var sb = new StringBuilder(); W(sb, v); return sb.ToString(); }

        static void W(StringBuilder sb, object v)
        {
            switch (v)
            {
                case null: sb.Append("null"); break;
                case string s: Q(sb, s); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case double d: sb.Append(double.IsNaN(d) || double.IsInfinity(d) ? "null" : d.ToString("R", CultureInfo.InvariantCulture)); break;
                case float f: sb.Append(float.IsNaN(f) || float.IsInfinity(f) ? "null" : ((double)f).ToString("R", CultureInfo.InvariantCulture)); break;
                case int n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); break;
                case long n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); break;
                case IDictionary d:
                    sb.Append('{');
                    bool first = true;
                    foreach (DictionaryEntry e in d) { if (!first) sb.Append(','); first = false; Q(sb, e.Key.ToString()); sb.Append(':'); W(sb, e.Value); }
                    sb.Append('}');
                    break;
                case IEnumerable l:
                    sb.Append('[');
                    bool f1 = true;
                    foreach (var x in l) { if (!f1) sb.Append(','); f1 = false; W(sb, x); }
                    sb.Append(']');
                    break;
                default: sb.Append(Convert.ToString(v, CultureInfo.InvariantCulture)); break;
            }
        }

        static void Q(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                if (c == '"') sb.Append("\\\"");
                else if (c == '\\') sb.Append("\\\\");
                else if (c == '\n') sb.Append("\\n");
                else if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            sb.Append('"');
        }

        // Loose readers: missing or mistyped values fall back to the default.
        public static Dictionary<string, object> Obj(object o, string k) => o is Dictionary<string, object> d && d.TryGetValue(k, out var v) ? v as Dictionary<string, object> : null;
        public static List<object> Arr(object o, string k) => o is Dictionary<string, object> d && d.TryGetValue(k, out var v) ? v as List<object> : null;
        public static double Num(object o, string k, double def = 0) => o is Dictionary<string, object> d && d.TryGetValue(k, out var v) && v is double x && !double.IsNaN(x) ? x : def;
        public static string Str(object o, string k, string def = null) => o is Dictionary<string, object> d && d.TryGetValue(k, out var v) && v is string x ? x : def;
        public static bool Bool(object o, string k, bool def = false) => o is Dictionary<string, object> d && d.TryGetValue(k, out var v) && v is bool x ? x : def;
        public static bool Has(object o, string k) => o is Dictionary<string, object> d && d.ContainsKey(k);
    }
}
