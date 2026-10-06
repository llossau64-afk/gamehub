using GuessTheAnswer.Gameplay;
using GuessTheAnswer.Multiplayer;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>"RECONNECTING..." strip shown while the connection to the server is being restored during a game.</summary>
    public sealed class ConnectionBanner : MonoBehaviour
    {
        CanvasGroup group;
        Text label;
        GameFlow flow;
        bool visible;

        public static ConnectionBanner Create(Transform parent, GameFlow flow)
        {
            var bg = UIFactory.Panel(parent, "Connection Banner", Theme.Warning, 30f);
            UIFactory.Place(bg.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -20f), new Vector2(620f, 64f), new Vector2(0.5f, 1f));
            var banner = bg.gameObject.AddComponent<ConnectionBanner>();
            banner.flow = flow;
            banner.group = UIFactory.Group(bg);
            banner.group.alpha = 0f;
            banner.group.blocksRaycasts = false;
            var spinner = Spinner.Create(bg.rectTransform, 34f, Theme.TextOnAccent);
            UIFactory.Place((RectTransform)spinner.transform, new Vector2(0f, 0.5f), new Vector2(26f, 0f), new Vector2(34f, 34f), new Vector2(0f, 0.5f));
            banner.label = UIFactory.Label(bg.rectTransform, "RECONNECTING...", Theme.Small, Theme.TextOnAccent, Theme.Bold);
            UIFactory.Stretch(banner.label.rectTransform, 70f, 0f, 20f, 0f);
            flow.ConnectionChanged += banner.OnStatus;
            return banner;
        }

        void OnStatus(ConnectionStatus status)
        {
            bool show = status == ConnectionStatus.Reconnecting && flow.InRoom;
            if (show == visible) return;
            visible = show;
            Tween.Fade(group, show ? 1f : 0f, Theme.Normal);
            if (show) Tween.ScaleFrom(transform, 0.9f, 1f, 0.3f, Ease.OutBack);
            else UIFeedback.Play(Audio.Sfx.PlayerJoin);
        }
    }
}
