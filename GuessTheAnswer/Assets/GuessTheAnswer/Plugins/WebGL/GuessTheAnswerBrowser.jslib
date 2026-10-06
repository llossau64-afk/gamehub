// Browser bridge for Guess the Answer (Unity WebGL).
// WebSocket, clipboard, vibration, page visibility, URL parameters and the portal SDK hooks
// (window.GTAPlatform is defined by the WebGL template and adapts to CrazyGames / Poki / others).
var GuessTheAnswerBrowser = {
  $GTA: {
    sockets: {},
    nextId: 1,
    send: function (target, method, value) {
      try {
        if (typeof SendMessage === 'function') SendMessage(target, method, value);
        else if (typeof Module !== 'undefined' && Module.SendMessage) Module.SendMessage(target, method, value);
      } catch (e) { console.warn('[GTA] SendMessage failed', e); }
    },
    toHeap: function (str) {
      var size = lengthBytesUTF8(str) + 1;
      var buffer = _malloc(size);
      stringToUTF8(str, buffer, size);
      return buffer;
    }
  },

  GTA_WS_Connect: function (urlPtr, targetPtr) {
    var url = UTF8ToString(urlPtr);
    var target = UTF8ToString(targetPtr);
    var id = GTA.nextId++;
    var socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      setTimeout(function () { GTA.send(target, 'OnSocketClose', id + '|1006'); }, 0);
      return id;
    }
    GTA.sockets[id] = socket;
    socket.onopen = function () { GTA.send(target, 'OnSocketOpen', '' + id); };
    socket.onmessage = function (e) {
      if (typeof e.data === 'string') GTA.send(target, 'OnSocketMessage', id + '|' + e.data);
    };
    socket.onerror = function () { GTA.send(target, 'OnSocketError', '' + id); };
    socket.onclose = function (e) {
      delete GTA.sockets[id];
      GTA.send(target, 'OnSocketClose', id + '|' + (e && e.code ? e.code : 1006));
    };
    return id;
  },

  GTA_WS_Send: function (id, textPtr) {
    var socket = GTA.sockets[id];
    if (!socket || socket.readyState !== 1) return 0;
    socket.send(UTF8ToString(textPtr));
    return 1;
  },

  GTA_WS_Close: function (id) {
    var socket = GTA.sockets[id];
    if (!socket) return;
    try { socket.close(1000, 'bye'); } catch (e) { }
  },

  GTA_CopyToClipboard: function (textPtr) {
    var text = UTF8ToString(textPtr);
    function fallback() {
      try {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      } catch (e) { }
    }
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(fallback);
      else fallback();
    } catch (e) { fallback(); }
  },

  GTA_Vibrate: function (ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { }
  },

  GTA_IsMobile: function () {
    var ua = navigator.userAgent || '';
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 1);
    return (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (touch && /Macintosh/.test(ua))) ? 1 : 0;
  },

  GTA_GetQueryParam: function (namePtr) {
    var name = UTF8ToString(namePtr);
    var value = '';
    try { value = new URLSearchParams(window.location.search).get(name) || ''; } catch (e) { }
    return GTA.toHeap(value);
  },

  GTA_RegisterVisibility: function (targetPtr) {
    var target = UTF8ToString(targetPtr);
    document.addEventListener('visibilitychange', function () {
      GTA.send(target, 'OnBrowserVisibility', document.hidden ? '0' : '1');
    });
    window.addEventListener('blur', function () { GTA.send(target, 'OnBrowserFocus', '0'); });
    window.addEventListener('focus', function () { GTA.send(target, 'OnBrowserFocus', '1'); });
  },

  GTA_Platform: function (eventPtr) {
    var name = UTF8ToString(eventPtr);
    try {
      if (window.GTAPlatform && typeof window.GTAPlatform[name] === 'function') window.GTAPlatform[name]();
    } catch (e) { console.warn('[GTA] platform event failed: ' + name, e); }
  },

  GTA_PlatformName: function () {
    var name = (window.GTAPlatform && window.GTAPlatform.name) ? window.GTAPlatform.name : 'none';
    return GTA.toHeap(name);
  },

  GTA_PlatformAd: function (kindPtr, targetPtr) {
    var kind = UTF8ToString(kindPtr);
    var target = UTF8ToString(targetPtr);
    var done = false;
    function finish(result) {
      if (done) return;
      done = true;
      GTA.send(target, 'OnAdFinished', kind + '|' + (result ? '1' : '0'));
    }
    try {
      if (window.GTAPlatform && typeof window.GTAPlatform.showAd === 'function') window.GTAPlatform.showAd(kind, finish);
      else finish(false);
    } catch (e) { finish(false); }
  }
};

autoAddDeps(GuessTheAnswerBrowser, '$GTA');
mergeInto(LibraryManager.library, GuessTheAnswerBrowser);
