using System;
using BarberSimulator.CameraSystems;
using BarberSimulator.Cinematics;
using BarberSimulator.Interaction;
using BarberSimulator.Player;
using BarberSimulator.Shop;
using UnityEngine;

namespace BarberSimulator.Core
{
    /// <summary>Scene objects the bootstrap wires together. Filled in by the scene generator / inspector.</summary>
    [Serializable]
    public sealed class SceneReferences
    {
        public Camera MainCamera;
        public CinematicCamera CinematicCamera;
        public MenuCameraDirector MenuDirector;
        public IntroSequence Intro;
        public FirstPersonController Player;
        public FirstPersonHands Hands;
        public Interactor Interactor;
        public PlayerAudio PlayerAudio;
        public ShopState Shop;
        public PlanarMirror Mirror;
        public Barber.BarberModeController BarberMode;
        public Customers.ShopCustomerSite CustomerSite;
        public Customers.CustomerSpawner CustomerSpawner;
        public Workday.ShopSign Sign;
        public ShopComputer Computer;
        [Tooltip("Objects only shown behind the main menu (ambient barber + customers).")]
        public GameObject MenuOnly;
        [Tooltip("Lights whose shadows follow the quality settings.")]
        public Light[] ShadowLights = Array.Empty<Light>();

        [NonSerialized] public InteractionContext InteractionContext;
    }
}
