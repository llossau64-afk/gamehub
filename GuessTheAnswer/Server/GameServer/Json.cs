using System;
using System.Text.Json;
using System.Text.Json.Serialization;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Server
{
    /// <summary>JSON settings that match Unity's JsonUtility: public fields, original field names, enums as numbers.</summary>
    public static class Json
    {
        public static readonly JsonSerializerOptions Options = new JsonSerializerOptions
        {
            IncludeFields = true,
            PropertyNamingPolicy = null,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            NumberHandling = JsonNumberHandling.AllowReadingFromString,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
        };

        public static string Wrap(string type, object payload)
        {
            string inner = payload == null ? "{}" : JsonSerializer.Serialize(payload, payload.GetType(), Options);
            return JsonSerializer.Serialize(new Envelope { t = type, d = inner }, Options);
        }

        public static bool TryUnwrap(string text, out Envelope envelope)
        {
            envelope = null;
            try
            {
                envelope = JsonSerializer.Deserialize<Envelope>(text, Options);
                return envelope != null && !string.IsNullOrEmpty(envelope.t);
            }
            catch (JsonException)
            {
                return false;
            }
        }

        public static T Payload<T>(Envelope envelope) where T : class, new()
        {
            if (string.IsNullOrEmpty(envelope.d)) return new T();
            try
            {
                return JsonSerializer.Deserialize<T>(envelope.d, Options) ?? new T();
            }
            catch (JsonException)
            {
                return null;
            }
        }

        public static object Payload(Envelope envelope, Type type)
        {
            try
            {
                if (string.IsNullOrEmpty(envelope.d)) return Activator.CreateInstance(type);
                return JsonSerializer.Deserialize(envelope.d, type, Options) ?? Activator.CreateInstance(type);
            }
            catch (JsonException)
            {
                return null;
            }
        }

        public static T Read<T>(string text) where T : class
        {
            return JsonSerializer.Deserialize<T>(text, Options);
        }
    }
}
