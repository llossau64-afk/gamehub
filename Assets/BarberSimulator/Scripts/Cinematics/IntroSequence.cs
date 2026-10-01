using System;
using System.Collections;
using System.Collections.Generic;
using BarberSimulator.CameraSystems;
using BarberSimulator.Characters;
using BarberSimulator.Core;
using BarberSimulator.Dialogue;
using BarberSimulator.Interaction;
using BarberSimulator.NPC;
using UnityEngine;

namespace BarberSimulator.Cinematics
{
    /// <summary>
    /// Day-1 opening (~60–75 s): fade in on the street, walk up to the tired old shop, the door bell rings, the
    /// previous owner waits inside, sells the place and hands over the keys, gives one piece of advice and leaves.
    /// The player looks around the run-down shop ("Let's fix this place."), the title appears and the camera ends
    /// on the player's head so first-person control blends in seamlessly. Hold Esc / Space (or the on-screen
    /// button) to skip.
    /// </summary>
    public sealed class IntroSequence : MonoBehaviour
    {
        // Dialogue beats: indices into the intro conversation (see ContentAssetsBuilder.BuildIntroDialogue).
        private const int ArrivalFirst = 0, ArrivalLast = 7;   // "So... you're the one" .. "I'm done with it."
        private const int OfferLine = 8;                       // "But maybe you can make something out of this place."
        private const int KeysFirst = 9, KeysLast = 11;        // "She's yours now." / "That's it?" / "That's it."
        private const int AdviceFirst = 12, AdviceLast = 14;   // "One piece of advice..." .. "lives or dies."
        private const int PlayerAlright = 15, PlayerFix = 16;  // "Alright..." / "Let's fix this place."
        private const int LookAroundLine = 4;                  // the owner glances around while saying "Long enough."

        [Header("Arrival")]
        [SerializeField] private Transform approachStart;
        [SerializeField] private Transform approachTarget;
        [SerializeField] private CameraShot doorShot;
        [SerializeField] private CameraShot enterShot;

        [Header("Inside")]
        [Tooltip("Player point of view while talking to the owner.")]
        [SerializeField] private Transform talkPose;
        [Tooltip("A step back from the counter so the owner can be watched walking to the door.")]
        [SerializeField] private Transform farewellPose;
        [Tooltip("Look-around beats after the owner left (old chair, dirty mirror, empty shelves, old furniture).")]
        [SerializeField] private List<Transform> lookAround = new List<Transform>();
        [Tooltip("Ends on the player's head pose so first-person control takes over without a cut.")]
        [SerializeField] private Transform endPose;

        [Header("Previous owner")]
        [SerializeField] private NpcMotor ownerMotor;
        [SerializeField] private ProceduralCharacterAnimator ownerAnimator;
        [SerializeField] private Transform ownerInsideMark;
        [Tooltip("Where the owner stops on his way out and turns back for his advice.")]
        [SerializeField] private Transform ownerTurnMark;
        [SerializeField] private Transform ownerDoorMark;
        [SerializeField] private Transform ownerExitMark;
        [SerializeField] private SwingDoor frontDoor;

        [Header("Skip")]
        [SerializeField] private float skipAvailableAfter = 1.0f;
        [SerializeField] private float holdToSkipSeconds = 1.1f;

        private GameContext _context;
        private CinematicCamera _camera;
        private DialoguePlayer _dialogue;
        private Coroutine _main;
        private bool _skipAvailable;
        private bool _finished;
        private float _skipHold;
        private Action _onComplete;

        public bool IsPlaying => _main != null;

        /// <summary>Raised when the menu-only dressing should disappear (the screen is black at that moment).</summary>
        public event Action CutToStreet;

        public void Configure(Transform approachFrom, Transform approach, CameraShot door, CameraShot enter, Transform talk, Transform farewell,
            List<Transform> lookBeats, Transform end, NpcMotor motor, ProceduralCharacterAnimator animator, Transform inside, Transform turn,
            Transform doorMark, Transform exit, SwingDoor entrance)
        {
            approachStart = approachFrom;
            approachTarget = approach;
            doorShot = door;
            enterShot = enter;
            talkPose = talk;
            farewellPose = farewell;
            lookAround = lookBeats;
            endPose = end;
            ownerMotor = motor;
            ownerAnimator = animator;
            ownerInsideMark = inside;
            ownerTurnMark = turn;
            ownerDoorMark = doorMark;
            ownerExitMark = exit;
            frontDoor = entrance;
        }

        public void Initialize(GameContext context, CinematicCamera cinematicCamera)
        {
            _context = context;
            _camera = cinematicCamera;
            _dialogue = new DialoguePlayer(context.UI.Cinematic, context.Localization, context.Audio);
            _dialogue.LineStarted += OnLineStarted;
            ownerMotor.gameObject.SetActive(false);
        }

        /// <param name="skipApproach">Kept for callers that start the intro right after a scene reload.</param>
        public void Play(Action onComplete, bool skipApproach)
        {
            _onComplete = onComplete;
            _finished = false;
            _skipAvailable = false;
            _skipHold = 0f;
            _context.UI.Cinematic.SkipClicked += OnSkipClicked;
            _main = StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            var ui = _context.UI;
            var audio = _context.Audio;
            var sounds = audio.Library;
            var config = _context.Config;
            var lines = config.introConversation.Lines;

            bool touch = _context.Input.Mode == BarberSimulator.Input.InputDeviceMode.Touch;
            ui.Cinematic.SetSkipLabel(_context.Localization.Get(touch ? "intro.hold_skip_touch" : "intro.hold_skip"));
            ui.Cinematic.SetSkipProgress(0f);
            ui.Cinematic.Show();
            ui.Cinematic.SetLetterbox(true);
            StartCoroutine(EnableSkipLater());

            // 1. Fade to black from the menu, then fade up on the street in front of the old shop.
            audio.FadeMusic(0f, 2.5f);
            yield return ui.GlobalFade.FadeTo(1f, 0.6f);
            CutToStreet?.Invoke();
            PrepareShop();
            audio.SetAmbience("street", sounds.streetAmbience, config.streetAmbienceOutside, 0.8f);
            audio.SetAmbience("shop", sounds.shopAmbience, 0f, 0.8f);
            _camera.SetPose(approachStart, 46f, 0.3f);
            _camera.RunMove(_camera.MoveTo(approachTarget, 50f, 7.5f, 0.3f));
            yield return new WaitForSeconds(0.3f);
            yield return ui.GlobalFade.FadeTo(0f, 1.6f);
            yield return new WaitForSeconds(5.2f);

            // 2. At the door: it opens, the bell rings.
            _camera.SetPose(doorShot.StartPoint, doorShot.StartFov, doorShot.Handheld);
            _camera.RunMove(_camera.PlayShot(doorShot));
            yield return new WaitForSeconds(1.2f);
            frontDoor.SetOpen(true, playSound: true);
            if (sounds.doorBell != null) audio.PlaySfxAt(sounds.doorBell, frontDoor.transform.position, 0.9f, 0.02f);
            yield return new WaitForSeconds(1.0f);

            // 3. Step inside: the previous owner is waiting by the counter.
            audio.SetAmbience("street", sounds.streetAmbience, config.streetAmbienceInside, 2.5f, config.insideStreetLowPass);
            audio.SetAmbience("shop", sounds.shopAmbience, config.shopAmbienceLevel, 2.5f);
            ownerAnimator.SetLookTarget(enterShot.EndPoint.position);
            yield return _camera.PlayShot(enterShot);
            frontDoor.SetOpen(false, playSound: true);
            yield return _camera.MoveTo(talkPose, 50f, 1.4f, 0.3f);
            _camera.RunMove(Drift(talkPose, 0.06f));
            ownerAnimator.SetLookTarget(talkPose.position);

            // 4. The conversation.
            yield return PlayLines(lines, ArrivalFirst, ArrivalLast);
            yield return new WaitForSeconds(0.8f);
            yield return PlayLines(lines, OfferLine, OfferLine);

            // Keys change hands.
            ownerAnimator.Trigger("pay");
            yield return new WaitForSeconds(0.55f);
            if (sounds.keysJingle != null) audio.PlaySfxAt(sounds.keysJingle, ownerMotor.transform.position + Vector3.up, 0.9f, 0.03f);
            yield return new WaitForSeconds(0.6f);
            yield return PlayLines(lines, KeysFirst, KeysLast);

            // 5. He heads for the door, stops, turns around.
            _camera.RunMove(_camera.MoveTo(farewellPose, 52f, 2.2f, 0.3f));
            ownerAnimator.ClearLookTarget();
            ownerMotor.MoveTo(ownerTurnMark.position, ownerTurnMark.rotation);
            yield return WaitForOwner(6f);
            ownerAnimator.SetLookTarget(farewellPose.position);
            ownerAnimator.Trigger("lookaround");
            yield return new WaitForSeconds(0.6f);
            yield return PlayLines(lines, AdviceFirst, AdviceFirst + 1);
            yield return new WaitForSeconds(0.9f);
            yield return PlayLines(lines, AdviceLast, AdviceLast);
            yield return new WaitForSeconds(0.4f);

            // He leaves; the door closes behind him.
            ownerAnimator.ClearLookTarget();
            ownerMotor.MoveTo(ownerDoorMark.position);
            yield return WaitForOwner(5f);
            frontDoor.SetOpen(true, playSound: true);
            if (sounds.doorBell != null) audio.PlaySfxAt(sounds.doorBell, frontDoor.transform.position, 0.7f, 0.02f);
            ownerMotor.MoveTo(ownerExitMark.position);
            yield return new WaitForSeconds(1.6f);
            frontDoor.SetOpen(false, playSound: true);
            yield return new WaitForSeconds(0.8f);
            ownerMotor.gameObject.SetActive(false);

            // 6. Alone in the shop: look around at what you just bought.
            for (int i = 0; i < lookAround.Count; i++)
            {
                if (lookAround[i] == null) continue;
                yield return _camera.MoveTo(lookAround[i], 48f, 2.3f, 0.35f);
                yield return new WaitForSeconds(0.6f);
            }
            yield return _camera.MoveTo(endPose, config.gameplayFieldOfView, 2.0f, 0.2f);
            yield return PlayLines(lines, PlayerAlright, PlayerAlright);
            yield return new WaitForSeconds(0.7f);
            yield return PlayLines(lines, PlayerFix, PlayerFix);

            // 7. Title, then hand over to the player (the camera already sits at the player's eye position).
            ui.Cinematic.SetLetterbox(false);
            ui.Cinematic.ShowSkip(false);
            _skipAvailable = false;
            audio.PlayMusic(sounds.menuMusic, config.gameplayMusicLevel, 4f);
            yield return ui.Cinematic.PlayTitleCard(string.Empty, 1.6f);

            Finish(skipped: false);
        }

        private IEnumerator PlayLines(IReadOnlyList<DialogueLine> lines, int first, int last)
        {
            for (int i = first; i <= last && i < lines.Count; i++)
                yield return _dialogue.PlayLine(lines[i], i);
        }

        private IEnumerator WaitForOwner(float timeout)
        {
            float t = 0f;
            while (!ownerMotor.HasArrived && t < timeout)
            {
                t += Time.deltaTime;
                yield return null;
            }
        }

        /// <summary>Tiny breathing drift around a pose while people talk.</summary>
        private IEnumerator Drift(Transform pose, float amount)
        {
            var origin = pose.position;
            float t = 0f;
            while (true)
            {
                t += Time.deltaTime;
                var offset = new Vector3(Mathf.Sin(t * 0.31f), Mathf.Sin(t * 0.47f) * 0.4f, 0f) * amount;
                _camera.SetRawPose(origin + pose.rotation * offset, pose.rotation, 50f, 0.3f);
                yield return null;
            }
        }

        private void PrepareShop()
        {
            frontDoor.SetOpen(false, playSound: false, instant: true);
            ownerMotor.gameObject.SetActive(true);
            ownerMotor.Warp(ownerInsideMark.position, ownerInsideMark.rotation);
            ownerAnimator.Pose = CharacterPose.Stand;
            ownerAnimator.Talking = false;
        }

        private void OnLineStarted(DialogueLine line, int index)
        {
            bool ownerSpeaks = line.speaker != null && !line.speaker.IsPlayer;
            ownerAnimator.Talking = ownerSpeaks;
            if (ownerSpeaks && !string.IsNullOrEmpty(line.animationTrigger)) ownerAnimator.Trigger(line.animationTrigger);
            if (ownerSpeaks && index == LookAroundLine) ownerAnimator.Trigger("lookaround");
            if (ownerSpeaks) StartCoroutine(StopTalkingAfter(DialoguePlayer.EstimateDuration(_context.Localization.Get(line.textKey)) * 0.8f));
        }

        private IEnumerator StopTalkingAfter(float seconds)
        {
            yield return new WaitForSeconds(seconds);
            ownerAnimator.Talking = false;
        }

        private IEnumerator EnableSkipLater()
        {
            yield return new WaitForSeconds(skipAvailableAfter);
            if (_finished) yield break;
            _skipAvailable = true;
            _context.UI.Cinematic.ShowSkip(true);
        }

        // A click alone never skips: the button has to be held like the keys.
        private void OnSkipClicked() { }

        private void Update()
        {
            if (_finished || _main == null || !_skipAvailable) return;
            bool held = _context.Input.SkipHeld || _context.UI.Cinematic.SkipButtonHeld;
            _skipHold = held ? _skipHold + Time.unscaledDeltaTime : Mathf.MoveTowards(_skipHold, 0f, Time.unscaledDeltaTime * 3f);
            _context.UI.Cinematic.SetSkipProgress(_skipHold / holdToSkipSeconds);
            if (_skipHold >= holdToSkipSeconds) Skip();
        }

        private void Skip()
        {
            if (!_skipAvailable || _finished) return;
            _skipAvailable = false;
            if (_main != null) StopCoroutine(_main);
            _main = StartCoroutine(SkipRoutine());
        }

        private IEnumerator SkipRoutine()
        {
            var ui = _context.UI;
            ui.Cinematic.ShowSkip(false);
            ui.Cinematic.HideLine();
            yield return ui.GlobalFade.FadeTo(1f, 0.35f);
            _camera.StopMove();
            _camera.SetPose(endPose, _context.Config.gameplayFieldOfView, 0f);
            var audio = _context.Audio;
            audio.SetAmbience("street", audio.Library.streetAmbience, _context.Config.streetAmbienceInside, 0.5f, _context.Config.insideStreetLowPass);
            audio.SetAmbience("shop", audio.Library.shopAmbience, _context.Config.shopAmbienceLevel, 0.5f);
            audio.PlayMusic(audio.Library.menuMusic, _context.Config.gameplayMusicLevel, 3f);
            ownerMotor.gameObject.SetActive(false);
            frontDoor.SetOpen(false, playSound: false, instant: true);
            ui.Cinematic.SetLetterbox(false);
            CutToStreet?.Invoke();
            Finish(skipped: true);
            yield return ui.GlobalFade.FadeTo(0f, 0.6f);
        }

        private void Finish(bool skipped)
        {
            if (_finished) return;
            _finished = true;
            _main = null;
            _context.UI.Cinematic.SkipClicked -= OnSkipClicked;
            _context.UI.Cinematic.SetSkipProgress(0f);
            _context.UI.Cinematic.Hide();
            _onComplete?.Invoke();
        }
    }
}
