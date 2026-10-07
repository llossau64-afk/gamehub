// Portal integration layer. The game only talks to `platform`; each portal SDK is an
// adapter. Without an SDK (local play, itch, own site) the Null adapter is used.
//
// CrazyGames v3: window.CrazyGames.SDK  (load https://sdk.crazygames.com/crazygames-sdk-v3.js)
// GamePix:       window.GamePix         (load https://integration.gamepix.com/sdk/v3/gamepix.sdk.js)
// Playgama:      window.bridge          (Playgama Bridge)
// The SDK scripts are NOT bundled: the portal's packaging step adds them to index.html.

const LS_PREFIX = 'barber-empire:';

const localStore = {
  get(key) { try { return localStorage.getItem(LS_PREFIX + key); } catch (e) { return null; } },
  set(key, v) { try { localStorage.setItem(LS_PREFIX + key, v); } catch (e) { /* storage blocked */ } },
  remove(key) { try { localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* */ } },
};

class NullAdapter {
  constructor() { this.name = 'none'; }
  async init() {}
  loadingStart() {} loadingStop() {} gameplayStart() {} gameplayStop() {} happyTime() {}
  get rewardedAvailable() { return false; }
  showRewarded() { return Promise.resolve(false); }
  showMidgame() { return Promise.resolve(); }
  storageGet(k) { return localStore.get(k); }
  storageSet(k, v) { localStore.set(k, v); }
  storageRemove(k) { localStore.remove(k); }
  language() { return (navigator.language || 'en').slice(0, 2); }
}

class CrazyGamesAdapter extends NullAdapter {
  constructor(sdk) { super(); this.sdk = sdk; this.name = 'crazygames'; }
  async init() { await this.sdk.init(); if (this.sdk.environment === 'disabled') throw new Error('disabled'); }
  loadingStart() { this.sdk.game.loadingStart?.(); }
  loadingStop() { this.sdk.game.loadingStop?.(); }
  gameplayStart() { this.sdk.game.gameplayStart(); }
  gameplayStop() { this.sdk.game.gameplayStop(); }
  happyTime() { this.sdk.game.happytime?.(); }
  get rewardedAvailable() { return true; }
  showRewarded() {
    return new Promise((res) => this.sdk.ad.requestAd('rewarded', {
      adStarted: () => window.dispatchEvent(new Event('ad-start')),
      adFinished: () => { window.dispatchEvent(new Event('ad-end')); res(true); },
      adError: () => { window.dispatchEvent(new Event('ad-end')); res(false); },
    }));
  }
  showMidgame() {
    return new Promise((res) => this.sdk.ad.requestAd('midgame', {
      adStarted: () => window.dispatchEvent(new Event('ad-start')),
      adFinished: () => { window.dispatchEvent(new Event('ad-end')); res(); },
      adError: () => { window.dispatchEvent(new Event('ad-end')); res(); },
    }));
  }
  storageGet(k) { try { return this.sdk.data.getItem(k) ?? localStore.get(k); } catch (e) { return localStore.get(k); } }
  storageSet(k, v) { try { this.sdk.data.setItem(k, v); } catch (e) { /* */ } localStore.set(k, v); }
}

class GamePixAdapter extends NullAdapter {
  constructor(gp) { super(); this.gp = gp; this.name = 'gamepix'; }
  loadingStart() { this.gp.loading?.(0); }
  loadingStop() { this.gp.loaded?.(); }
  happyTime() { this.gp.happyMoment?.(); }
  get rewardedAvailable() { return !!this.gp.rewardAd; }
  async showRewarded() {
    window.dispatchEvent(new Event('ad-start'));
    try { const r = await this.gp.rewardAd(); return !!(r && r.success); } catch (e) { return false; } finally { window.dispatchEvent(new Event('ad-end')); }
  }
  async showMidgame() {
    window.dispatchEvent(new Event('ad-start'));
    try { await this.gp.interstitialAd?.(); } catch (e) { /* */ } finally { window.dispatchEvent(new Event('ad-end')); }
  }
  storageGet(k) { try { return this.gp.localStorage?.getItem(k) ?? localStore.get(k); } catch (e) { return localStore.get(k); } }
  storageSet(k, v) { try { this.gp.localStorage?.setItem(k, v); } catch (e) { /* */ } localStore.set(k, v); }
  language() { return this.gp.lang?.() || super.language(); }
}

class PlaygamaAdapter extends NullAdapter {
  constructor(bridge) { super(); this.b = bridge; this.name = 'playgama'; }
  async init() { if (this.b.initialize) await this.b.initialize(); }
  loadingStop() { this.b.platform?.sendMessage?.('game_ready'); }
  gameplayStart() { this.b.platform?.sendMessage?.('gameplay_started'); }
  gameplayStop() { this.b.platform?.sendMessage?.('gameplay_stopped'); }
  get rewardedAvailable() { return !!this.b.advertisement; }
  showRewarded() {
    return new Promise((res) => {
      const ad = this.b.advertisement;
      if (!ad) return res(false);
      const on = (state) => {
        if (state === 'opened') window.dispatchEvent(new Event('ad-start'));
        if (state === 'rewarded') { this._rewarded = true; }
        if (state === 'closed' || state === 'failed') {
          ad.off?.('rewarded_state_changed', on);
          window.dispatchEvent(new Event('ad-end'));
          res(!!this._rewarded); this._rewarded = false;
        }
      };
      ad.on?.('rewarded_state_changed', on);
      ad.showRewarded();
    });
  }
  showMidgame() { try { this.b.advertisement?.showInterstitial(); } catch (e) { /* */ } return Promise.resolve(); }
}

export const platform = {
  adapter: new NullAdapter(),
  async init() {
    const tryAdapter = async (A, arg) => {
      try { const a = new A(arg); await Promise.race([a.init(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000))]); this.adapter = a; return true; } catch (e) { return false; }
    };
    if (window.CrazyGames?.SDK && await tryAdapter(CrazyGamesAdapter, window.CrazyGames.SDK)) return;
    if (window.GamePix && await tryAdapter(GamePixAdapter, window.GamePix)) return;
    if (window.bridge && await tryAdapter(PlaygamaAdapter, window.bridge)) return;
    this.adapter = new NullAdapter();
  },
  get name() { return this.adapter.name; },
  loadingStart() { try { this.adapter.loadingStart(); } catch (e) { /* */ } },
  loadingStop() { try { this.adapter.loadingStop(); } catch (e) { /* */ } },
  gameplayStart() { if (this._gp) return; this._gp = true; try { this.adapter.gameplayStart(); } catch (e) { /* */ } },
  gameplayStop() { if (!this._gp) return; this._gp = false; try { this.adapter.gameplayStop(); } catch (e) { /* */ } },
  happyTime() {
    const now = performance.now();
    if (this._lastHappy && now - this._lastHappy < 15000) return;
    this._lastHappy = now;
    try { this.adapter.happyTime(); } catch (e) { /* */ }
  },
  get rewardedAvailable() { return this.adapter.rewardedAvailable; },
  showRewarded() { return this.adapter.showRewarded(); },
  showMidgame() {
    // never in the first minute, then at most every 3 minutes
    const now = performance.now();
    if (now < 60000 || (this._lastMid && now - this._lastMid < 180000)) return Promise.resolve();
    this._lastMid = now;
    return this.adapter.showMidgame();
  },
  load(key) { try { return this.adapter.storageGet(key); } catch (e) { return localStore.get(key); } },
  save(key, v) { try { this.adapter.storageSet(key, v); } catch (e) { localStore.set(key, v); } },
  remove(key) { try { this.adapter.storageRemove?.(key); } catch (e) { /* */ } localStore.remove(key); },
};
