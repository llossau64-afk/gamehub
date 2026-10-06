// CrazyGames SDK v3 bridge. Only loads when the game runs on CrazyGames (or with ?crazygames),
// so the standalone build makes no external requests. Every call is safe when the SDK is absent.
import { audio } from './audio.js';

function onCrazy() {
  try {
    return /crazygames|1001juegos/i.test(location.hostname) || /crazygames/i.test(document.referrer) || new URLSearchParams(location.search).has('crazygames');
  } catch (e) { return false; }
}

export const crazy = {
  sdk: null,
  ready: false,
  playing: false,
  async init() {
    if (!onCrazy()) return;
    try {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      this.sdk = window.CrazyGames && window.CrazyGames.SDK;
      if (!this.sdk) return;
      await this.sdk.init();
      this.ready = true;
    } catch (e) { this.sdk = null; this.ready = false; }
  },
  get ads() { return this.ready && this.sdk && this.sdk.ad; },
  loadingStop() { try { this.ready && this.sdk.game.loadingStop(); } catch (e) { } },
  gameplayStart() { if (!this.ready || this.playing) return; this.playing = true; try { this.sdk.game.gameplayStart(); } catch (e) { } },
  gameplayStop() { if (!this.ready || !this.playing) return; this.playing = false; try { this.sdk.game.gameplayStop(); } catch (e) { } },
  happytime() { try { this.ready && this.sdk.game.happytime(); } catch (e) { } },
  // Resolves true when a rewarded ad was watched to the end.
  rewarded() { return this.ad('rewarded'); },
  midgame() { return this.ad('midgame'); },
  ad(type) {
    return new Promise(resolve => {
      if (!this.ads) return resolve(false);
      const wasPlaying = this.playing; this.gameplayStop();
      const vol = audio.vol.master;
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => audio.setVolumes({ master: 0 }),
          adFinished: () => { audio.setVolumes({ master: vol }); if (wasPlaying) this.gameplayStart(); resolve(true); },
          adError: () => { audio.setVolumes({ master: vol }); if (wasPlaying) this.gameplayStart(); resolve(false); },
        });
      } catch (e) { audio.setVolumes({ master: vol }); resolve(false); }
    });
  },
};
