// Thin portal adapter. Uses the CrazyGames SDK v3 when the page provides it,
// otherwise every call is a harmless no-op (GamePix, Playgama, itch.io, local).

export class Platform {
  constructor() {
    this.sdk = null;
    this.name = 'none';
    this.inGameplay = false;
  }
  async init() {
    try {
      const cg = window.CrazyGames && window.CrazyGames.SDK;
      if (cg) {
        await Promise.race([cg.init(), new Promise((r) => setTimeout(r, 4000))]);
        if (cg.environment && cg.environment !== 'disabled') { this.sdk = cg; this.name = 'crazygames'; }
      }
    } catch (e) { this.sdk = null; }
    return this;
  }
  get data() { return this.sdk && this.sdk.data ? this.sdk.data : null; }
  loadingStart() { try { this.sdk && this.sdk.game.loadingStart(); } catch (e) { /* noop */ } }
  loadingStop() { try { this.sdk && this.sdk.game.loadingStop(); } catch (e) { /* noop */ } }
  gameplayStart() { if (this.inGameplay) return; this.inGameplay = true; try { this.sdk && this.sdk.game.gameplayStart(); } catch (e) { /* noop */ } }
  gameplayStop() { if (!this.inGameplay) return; this.inGameplay = false; try { this.sdk && this.sdk.game.gameplayStop(); } catch (e) { /* noop */ } }
  happytime() { try { this.sdk && this.sdk.game.happytime(); } catch (e) { /* noop */ } }
}
