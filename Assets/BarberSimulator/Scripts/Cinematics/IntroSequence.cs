using System;
using System.Collections;
using BarberSimulator.Audio;
using BarberSimulator.CameraSystems;
using BarberSimulator.Characters;
using BarberSimulator.Core;
using BarberSimulator.Dialogue;
using BarberSimulator.Interaction;
using BarberSimulator.NPC;
using BarberSimulator.UI;
using UnityEngine;

namespace BarberSimulator.Cinematics
{
    /// <summary>
    /// Day-1 arrival cutscene (~30 s): approach from the menu camera, cut to the street, the previous owner
    /// unlocks the shop, camera follows inside, reveal, title card. Skippable after a short delay.
    /// </summary>
    public sealed class IntroSequence : MonoBehaviour
    {
        [Header("Camera")]
        [Tooltip("Exterior pose used when the menu camera was inside the shop when New Game was pressed.")]
        [SerializeField] private Transform approachStart;
        [SerializeField] private Transform approachTarget;
        [SerializeField] private CameraShot streetShot;
        [SerializeField] private CameraShot doorShot;
        [SerializeField] private CameraShot enterShot;
        [SerializeField] private CameraShot revealShot;

        [Header("Previous owner")]
        [SerializeField] private NpcMotor ownerMotor;
        [SerializeField] private ProceduralCharacterAnimator ownerAnimator;
        [SerializeField] private Transform ownerOutsideMark;
        [SerializeField] private Transform ownerDoorMark;
        [SerializeField] private Transform ownerInsideMark;
        [Tooltip("Waypoint beside the player's start so the owner never walks through the camera when leaving.")]
        [SerializeField] private Transform ownerPassMark;
        [SerializeField] private Transform ownerExitMark;
        [SerializeField] private SwingDoor frontDoor;

        [SerializeField] private float skipAvailableAfter = 1.5f;

        private GameContext _context;
        private CinematicCamera _camera;
        private DialoguePlayer _dialogue;
        private Coroutine _main;
        private bool _skipAvailable;
        private bool _finished;
        private Action _onComplete;
        private bool _skipApproach;

        public bool IsPlaying => _main != null;

        /// <summary>Raised while the screen is black between the menu push-in and the street shot.</summary>
        public event Action CutToStreet;

        public void Configure(Transform approachFrom, Transform approach, CameraShot street, CameraShot door, CameraShot enter, CameraShot reveal,
            NpcMotor motor, ProceduralCharacterAnimator animator, Transform outside, Transform doorMark, Transform inside, Transform pass, Transform exit, SwingDoor entrance)
        {
            approachStart = approachFrom;
            approachTarget = approach;
            streetShot = street;
            doorShot = door;
            enterShot = enter;
            revealShot = reveal;
            ownerMotor = motor;
            ownerAnimator = animator;
            ownerOutsideMark = outside;
            ownerDoorMark = doorMark;
            ownerInsideMark = inside;
            ownerPassMark = pass;
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

        public void Play(Action onComplete, bool skipApproach)
        {
            _skipApproach = skipApproach;
            _onComplete = onComplete;
            _finished = false;
            _skipAvailable = false;
            _context.Input.SkipPressed += OnSkipRequested;
            _context.Input.PausePressed += OnSkipRequested;
            _context.UI.Cinematic.SkipClicked += OnSkipRequested;
            _main = StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            var ui = _context.UI;
            var audio = _context.Audio;
            var sounds = audio.Library;
            var config = _context.Config;

            ui.Cinematic.SetSkipLabel(_context.Localization.Get("intro.skip"));
            ui.Cinematic.Show();
            StartCoroutine(EnableSkipLater());

            // 1. Push in from the menu shot towards the door, then cut to black.
            ui.Cinematic.SetLetterbox(true);
            audio.FadeMusic(0f, 3f);
            if (!_skipApproach)
            {
                audio.PlayUI(sounds.uiWhoosh, 0.8f);
                StartCoroutine(ui.SceneFade.FadeTo(0f, 0.4f));
                // Never fly through walls: if the menu shot was inside, dip and cut to the street first.
                bool cameraInside = _camera.Camera.transform.position.z > -0.4f;
                if (cameraInside)
                {
                    yield return ui.GlobalFade.FadeTo(1f, 0.45f);
                    _camera.SetPose(approachStart, 46f, 0.2f);
                    StartCoroutine(ui.GlobalFade.FadeTo(0f, 0.6f));
                }
                yield return _camera.MoveTo(approachTarget, 52f, cameraInside ? 2.4f : 2.8f, 0.2f);
                yield return ui.GlobalFade.FadeTo(1f, 0.6f);
            }
            else
            {
                ui.GlobalFade.SetAlpha(1f);
                ui.SceneFade.SetAlpha(0f);
            }

            // 2. Street, previous owner waiting outside.
            CutToStreet?.Invoke();
            PrepareStreet();
            audio.SetAmbience("street", sounds.streetAmbience, config.streetAmbienceOutside, 0.8f);
            audio.SetAmbience("shop", sounds.shopAmbience, 0f, 0.8f);
            _camera.SetPose(streetShot.StartPoint, streetShot.StartFov, streetShot.Handheld);
            _camera.RunMove(_camera.PlayShot(streetShot));
            yield return new WaitForSeconds(0.4f);
            yield return ui.GlobalFade.FadeTo(0f, 1.1f);

            var lines = _context.Config.introConversation.Lines;
            for (int i = 0; i < Mathf.Min(3, lines.Count); i++)
                yield return _dialogue.PlayLine(lines[i], i);

            // 3. Unlock and open the door.
            _camera.SetPose(doorShot.StartPoint, doorShot.StartFov, doorShot.Handheld);
            _camera.RunMove(_camera.PlayShot(doorShot));
            ownerAnimator.ClearLookTarget();
            ownerMotor.MoveTo(ownerDoorMark.position, ownerDoorMark.rotation);
            yield return new WaitForSeconds(1.0f);
            audio.PlaySfxAt(sounds.doorUnlock, frontDoor.transform.position, 1f, 0.02f);
            ownerAnimator.Trigger("unlock");
            yield return new WaitForSeconds(1.1f);
            frontDoor.SetOpen(true, playSound: true);
            yield return new WaitForSeconds(0.7f);

            // 4. Follow inside.
            ownerMotor.MoveTo(ownerInsideMark.position, ownerInsideMark.rotation);
            audio.SetAmbience("street", sounds.streetAmbience, config.streetAmbienceInside, 2.5f, config.insideStreetLowPass);
            audio.SetAmbience("shop", sounds.shopAmbience, config.shopAmbienceLevel, 2.5f);
            yield return _camera.PlayShot(enterShot);

            // 5. Reveal.
            _camera.RunMove(_camera.PlayShot(revealShot));
            ownerAnimator.SetLookTarget(_camera.Camera.transform.position);
            yield return new WaitForSeconds(0.6f);
            for (int i = 3; i < lines.Count; i++)
                yield return _dialogue.PlayLine(lines[i], i);
            yield return new WaitForSeconds(0.4f);

            // 6. Title card over the shop, then hand control to the player.
            ui.Cinematic.SetLetterbox(false);
            ui.Cinematic.ShowSkip(false);
            _skipAvailable = false;
            yield return ui.Cinematic.PlayTitleCard(_context.Localization.Format("intro.day", _context.Save.Data.progression.day), 1.8f);

            Finish(skipped: false);
        }

        private void PrepareStreet()
        {
            frontDoor.SetOpen(false, playSound: false, instant: true);
            ownerMotor.gameObject.SetActive(true);
            ownerMotor.Warp(ownerOutsideMark.position, ownerOutsideMark.rotation);
            ownerAnimator.Pose = CharacterPose.Stand;
            ownerAnimator.SetLookTarget(streetShot.EndPoint.position);
        }

        private void OnLineStarted(DialogueLine line, int index)
        {
            bool ownerSpeaks = line.speaker != null && !line.speaker.IsPlayer;
            ownerAnimator.Talking = ownerSpeaks;
            if (ownerSpeaks && !string.IsNullOrEmpty(line.animationTrigger)) ownerAnimator.Trigger(line.animationTrigger);
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

        private void OnSkipRequested()
        {
            if (!_skipAvailable || _finished) return;
            _skipAvailable = false;
            if (_main != null) StopCoroutine(_main);
            _main = StartCoroutine(SkipRoutine());
        }

        private IEnumerator SkipRoutine()
        {
            _context.UI.Cinematic.ShowSkip(false);
            _context.UI.Cinematic.HideLine();
            yield return _context.UI.GlobalFade.FadeTo(1f, 0.35f);
            _camera.StopMove();
            _context.Audio.FadeMusic(0f, 0.5f);
            _context.Audio.SetAmbience("street", _context.Audio.Library.streetAmbience, _context.Config.streetAmbienceInside, 0.5f, _context.Config.insideStreetLowPass);
            _context.Audio.SetAmbience("shop", _context.Audio.Library.shopAmbience, _context.Config.shopAmbienceLevel, 0.5f);
            ownerMotor.gameObject.SetActive(false);
            frontDoor.SetOpen(false, playSound: false, instant: true);
            _context.UI.Cinematic.SetLetterbox(false);
            CutToStreet?.Invoke();
            Finish(skipped: true);
        }

        private void Finish(bool skipped)
        {
            if (_finished) return;
            _finished = true;
            _main = null;
            _context.Input.SkipPressed -= OnSkipRequested;
            _context.Input.PausePressed -= OnSkipRequested;
            _context.UI.Cinematic.SkipClicked -= OnSkipRequested;
            _context.UI.Cinematic.Hide();

            if (!skipped) StartCoroutine(OwnerLeaves());
            _onComplete?.Invoke();
        }

        /// <summary>After handing over the keys the previous owner walks out and the door closes behind him.</summary>
        private IEnumerator OwnerLeaves()
        {
            ownerAnimator.Talking = false;
            ownerAnimator.ClearLookTarget();
            yield return new WaitForSeconds(0.8f);
            if (ownerPassMark != null)
            {
                ownerMotor.MoveTo(ownerPassMark.position);
                while (!ownerMotor.HasArrived) yield return null;
            }
            ownerMotor.MoveTo(ownerDoorMark.position);
            while (!ownerMotor.HasArrived) yield return null;
            ownerMotor.MoveTo(ownerExitMark.position);
            while (!ownerMotor.HasArrived) yield return null;
            ownerMotor.gameObject.SetActive(false);
            if (frontDoor.IsOpen) frontDoor.SetOpen(false, playSound: true);
        }
    }
}
