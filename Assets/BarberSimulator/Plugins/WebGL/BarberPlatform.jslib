// Bridge between Unity and the CrazyGames HTML5 SDK v3 (window.CrazyGames.SDK).
// C# side: Scripts/Platform/PlatformNative.cs. Callbacks go to the persistent GameObject named by the caller
// (PlatformReceiver) through SendMessage. Every SDK call is guarded: a missing or failing SDK never throws into Unity.
//
// The WebGL template (WebGLTemplates/BarberSimulator/index.html) normally initialises the SDK before Unity starts and
// stores the outcome in window.__barberPlatform. If another template is used, BarberPlatform_Init initialises it here.

mergeInto(LibraryManager.library, {

  BarberPlatform_IsSdkPresent: function () {
    var state = window.__barberPlatform;
    if (state && state.initDone && !state.ready) return 0;
    var cg = window.CrazyGames;
    if (!cg || !cg.SDK) return 0;
    // On hosts other than CrazyGames (GamePix, itch.io, ...) the script loads but reports "disabled".
    if (cg.SDK.environment === 'disabled') return 0;
    return 1;
  },

  // Returns 1 when the SDK is ready, 0 when it failed, 2 when the result will arrive through OnPlatformInit.
  BarberPlatform_Init: function (receiverPtr) {
    var receiver = UTF8ToString(receiverPtr);
    var state = window.__barberPlatform = window.__barberPlatform || { adblock: -1 };
    var send = function (method, arg) {
      try {
        if (typeof SendMessage === 'function') SendMessage(receiver, method, arg);
        else if (typeof Module !== 'undefined' && Module.SendMessage) Module.SendMessage(receiver, method, arg);
      } catch (e) { console.warn('[BarberPlatform] SendMessage failed', e); }
    };
    var watchAdblock = function () {
      try {
        var p = window.CrazyGames.SDK.ad.hasAdblock();
        if (p && p.then) p.then(function (v) { state.adblock = v ? 1 : 0; }, function () { state.adblock = 0; });
        else state.adblock = p ? 1 : 0;
      } catch (e) { state.adblock = 0; }
    };

    if (state.initDone) {
      if (state.ready) watchAdblock();
      return state.ready ? 1 : 0;
    }
    var cg = window.CrazyGames;
    if (!cg || !cg.SDK) { state.initDone = true; state.ready = false; return 0; }
    if (state.initPromise) {
      state.initPromise.then(function () { if (state.ready) watchAdblock(); send('OnPlatformInit', state.ready ? '1' : '0'); });
      return 2;
    }
    try {
      var promise = cg.SDK.init();
      state.initPromise = promise;
      var finish = function (ok) {
        state.initDone = true;
        state.ready = !!ok && cg.SDK.environment !== 'disabled';
        if (state.ready) watchAdblock();
        send('OnPlatformInit', state.ready ? '1' : '0');
      };
      if (promise && promise.then) promise.then(function () { finish(true); }, function () { finish(false); });
      else finish(true);
      return 2;
    } catch (e) {
      console.warn('[BarberPlatform] SDK init failed', e);
      state.initDone = true; state.ready = false;
      return 0;
    }
  },

  BarberPlatform_LoadingStart: function () {
    var s = window.__barberPlatform;
    if (!s || !s.ready || s.loading) return;
    try { window.CrazyGames.SDK.game.loadingStart(); s.loading = true; } catch (e) { console.warn(e); }
  },

  BarberPlatform_LoadingStop: function () {
    var s = window.__barberPlatform;
    if (!s || !s.ready || !s.loading) return;
    try { window.CrazyGames.SDK.game.loadingStop(); s.loading = false; } catch (e) { console.warn(e); }
  },

  BarberPlatform_GameplayStart: function () {
    var s = window.__barberPlatform;
    if (!s || !s.ready || s.gameplay) return;
    try { window.CrazyGames.SDK.game.gameplayStart(); s.gameplay = true; } catch (e) { console.warn(e); }
  },

  BarberPlatform_GameplayStop: function () {
    var s = window.__barberPlatform;
    if (!s || !s.ready || !s.gameplay) return;
    try { window.CrazyGames.SDK.game.gameplayStop(); s.gameplay = false; } catch (e) { console.warn(e); }
  },

  BarberPlatform_HappyTime: function () {
    var s = window.__barberPlatform;
    if (!s || !s.ready) return;
    try { window.CrazyGames.SDK.game.happytime(); } catch (e) { console.warn(e); }
  },

  // adType: 'midgame' | 'rewarded'
  BarberPlatform_RequestAd: function (typePtr, receiverPtr) {
    var type = UTF8ToString(typePtr);
    var receiver = UTF8ToString(receiverPtr);
    var send = function (method, arg) {
      try {
        if (typeof SendMessage === 'function') SendMessage(receiver, method, arg);
        else if (typeof Module !== 'undefined' && Module.SendMessage) Module.SendMessage(receiver, method, arg);
      } catch (e) { console.warn('[BarberPlatform] SendMessage failed', e); }
    };
    var s = window.__barberPlatform;
    if (!s || !s.ready) { send('OnAdError', 'sdk not ready'); return; }
    try {
      var result = window.CrazyGames.SDK.ad.requestAd(type, {
        adStarted: function () { send('OnAdStarted', type); },
        adFinished: function () { send('OnAdFinished', type); },
        adError: function (error) { send('OnAdError', String(error && error.message ? error.message : error)); }
      });
      // Duplicate results are ignored on the C# side.
      if (result && result.catch) result.catch(function (e) { send('OnAdError', String(e && e.message ? e.message : e)); });
    } catch (e) {
      send('OnAdError', String(e && e.message ? e.message : e));
    }
  },

  // 1 blocked, 0 not blocked, -1 not known yet.
  BarberPlatform_HasAdblock: function () {
    var s = window.__barberPlatform;
    return s && typeof s.adblock === 'number' ? s.adblock : -1;
  },

  BarberPlatform_GetItem: function (keyPtr) {
    var s = window.__barberPlatform;
    if (!s || !s.ready) return 0;
    try {
      var value = window.CrazyGames.SDK.data.getItem(UTF8ToString(keyPtr));
      if (value === null || value === undefined) return 0;
      value = String(value);
      var size = lengthBytesUTF8(value) + 1;
      var buffer = _malloc(size);
      stringToUTF8(value, buffer, size);
      return buffer;
    } catch (e) { console.warn(e); return 0; }
  },

  BarberPlatform_SetItem: function (keyPtr, valuePtr) {
    var s = window.__barberPlatform;
    if (!s || !s.ready) return;
    try { window.CrazyGames.SDK.data.setItem(UTF8ToString(keyPtr), UTF8ToString(valuePtr)); } catch (e) { console.warn(e); }
  },

  BarberPlatform_RemoveItem: function (keyPtr) {
    var s = window.__barberPlatform;
    if (!s || !s.ready) return;
    try { window.CrazyGames.SDK.data.removeItem(UTF8ToString(keyPtr)); } catch (e) { console.warn(e); }
  },

  // Locale such as "en-US" from the SDK's system info, falling back to the browser language.
  BarberPlatform_GetLocale: function () {
    var locale = null;
    try {
      var info = window.CrazyGames.SDK.user.systemInfo;
      if (info && info.locale) locale = info.locale;
    } catch (e) { }
    if (!locale && typeof navigator !== 'undefined') locale = navigator.language;
    if (!locale) return 0;
    var size = lengthBytesUTF8(locale) + 1;
    var buffer = _malloc(size);
    stringToUTF8(locale, buffer, size);
    return buffer;
  }
});
