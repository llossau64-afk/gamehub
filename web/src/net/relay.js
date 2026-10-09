// Code-based online play that works anywhere (GitHub Pages, the Mac app, any browser):
// a tiny MQTT 3.1.1 client over WebSocket talking to a free public broker. Players in the
// same shop share one topic; everybody publishes their whole state a few times a second
// and listens to the others. Nobody needs an account, an invite or a server of our own.
//
// The object returned by joinRelay() mimics the bits of the artifact runtime's named room
// that online.js uses: presence(patch), peers(), onPeers(fn), leave().

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const ROOT = 'barberempire/v1/';
const STALE_MS = 6000;      // a player we haven't heard from for this long has left
const BEAT_MS = 2000;       // resend the full state at least this often
const MAX_MSG = 6000;

const enc = new TextEncoder(), dec = new TextDecoder();

function varint(n) {
  const out = [];
  do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
  return out;
}
function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function packet(type, body) { return new Uint8Array([type, ...varint(body.length), ...body]); }

class Mqtt {
  constructor(url) { this.url = url; this.onMessage = null; this.onClose = null; this.buf = new Uint8Array(0); this.pid = 1; }

  connect(clientId, will) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (e) => { if (!done) { done = true; reject(e); } };
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { fail(e); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const timer = setTimeout(() => { fail(new Error('timeout')); try { ws.close(); } catch (e) { /* */ } }, 6000);
      ws.onopen = () => {
        const flags = 0x02 | (will ? 0x04 : 0);
        const body = [...str('MQTT'), 4, flags, 0, 30, ...str(clientId)];
        if (will) body.push(...str(will.topic), ...str(will.payload));
        ws.send(packet(0x10, body));
      };
      ws.onerror = () => fail(new Error('socket'));
      ws.onclose = () => { clearTimeout(timer); clearInterval(this.ping); fail(new Error('closed')); if (done) this.onClose?.(); };
      ws.onmessage = (ev) => {
        const chunk = new Uint8Array(ev.data);
        const b = new Uint8Array(this.buf.length + chunk.length);
        b.set(this.buf); b.set(chunk, this.buf.length);
        this.buf = b;
        this.drain((type, body) => {
          if (type === 2) {          // CONNACK
            clearTimeout(timer);
            if (body[1] !== 0) { fail(new Error('refused')); return; }
            done = true;
            this.ping = setInterval(() => this.send(packet(0xc0, [])), 20000);
            resolve();
          } else if (type === 3) this.onPublish(body);
        });
      };
    });
  }

  drain(fn) {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      let len = 0, mul = 1, i = 1, byte;
      do { if (i >= b.length) return; byte = b[i++]; len += (byte & 127) * mul; mul *= 128; } while (byte & 128);
      if (b.length < i + len) return;
      const type = b[0] >> 4, flags = b[0] & 15;
      const body = b.subarray(i, i + len);
      this.buf = b.slice(i + len);
      this.flags = flags;
      fn(type, body);
    }
  }

  onPublish(body) {
    const tl = (body[0] << 8) | body[1];
    const topic = dec.decode(body.subarray(2, 2 + tl));
    let p = 2 + tl;
    if ((this.flags >> 1) & 3) p += 2;  // QoS > 0 carries a packet id
    if (body.length - p > MAX_MSG) return;
    this.onMessage?.(topic, dec.decode(body.subarray(p)));
  }

  send(bytes) { if (this.ws?.readyState === 1) this.ws.send(bytes); }
  subscribe(filter) { const id = this.pid++; this.send(packet(0x82, [id >> 8, id & 255, ...str(filter), 0])); }
  publish(topic, payload) { this.send(packet(0x30, [...str(topic), ...enc.encode(payload)])); }
  close() { clearInterval(this.ping); this.send(packet(0xe0, [])); try { this.ws.close(); } catch (e) { /* */ } }
}

// joins shop `code` and resolves a room-like handle (or rejects when no broker answers)
export async function joinRelay(code) {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const base = ROOT + code.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) + '/';
  const override = new URLSearchParams(location.search).get('relay');
  const brokers = override ? [override] : BROKERS;
  let mq = null;
  for (const url of brokers) {
    const m = new Mqtt(url);
    try {
      await m.connect('be-' + id, { topic: base + 'p', payload: JSON.stringify({ id, bye: true }) });
      mq = m;
      break;
    } catch (e) { /* next broker */ }
  }
  if (!mq) throw new Error('Couldn’t reach the online server. Check your internet connection and try again.');

  const me = {};
  const others = new Map();   // id -> { presence, seen }
  const listeners = new Set();
  let snapshot = [];
  let lastSend = 0, left = false;

  const rebuild = () => {
    snapshot = [{ peer: id, isMe: true, presence: { ...me } }, ...[...others].map(([pid, o]) => ({ peer: pid, isMe: false, presence: o.presence }))];
    for (const fn of listeners) { try { fn({ peers: snapshot }); } catch (e) { console.error(e); } }
  };
  const sendState = () => { lastSend = Date.now(); mq.publish(base + 'p', JSON.stringify({ id, s: me })); };

  mq.onMessage = (topic, text) => {
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m.id !== 'string' || m.id === id || m.id.length > 24) return;
    if (m.bye) { if (others.delete(m.id)) rebuild(); return; }
    if (!m.s || typeof m.s !== 'object') return;
    const known = others.has(m.id);
    others.set(m.id, { presence: m.s, seen: Date.now() });
    // a newcomer gets our state right away instead of waiting for the next beat
    if (!known) sendState();
    rebuild();
  };
  mq.subscribe(base + 'p');
  // say hello so the others answer with their state straight away
  setTimeout(sendState, 150);

  const beat = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [pid, o] of others) if (now - o.seen > STALE_MS) { others.delete(pid); changed = true; }
    if (changed) rebuild();
    if (now - lastSend > BEAT_MS) sendState();
  }, 500);
  mq.onClose = () => { if (!left) { others.clear(); rebuild(); } };

  rebuild();
  return {
    relay: true,
    presence: async (patch) => {
      for (const [k, v] of Object.entries(patch)) { if (v === null) delete me[k]; else me[k] = v; }
      sendState();
      rebuild();
    },
    peers: () => snapshot,
    onPeers: (fn) => { listeners.add(fn); setTimeout(() => fn({ peers: snapshot }), 0); return () => listeners.delete(fn); },
    leave: async () => {
      left = true;
      clearInterval(beat);
      mq.publish(base + 'p', JSON.stringify({ id, bye: true }));
      setTimeout(() => mq.close(), 100);
    },
  };
}
