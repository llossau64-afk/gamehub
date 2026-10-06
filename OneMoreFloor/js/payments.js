// Real-money key packs. CrazyGames sells in-game items through its Xsolla integration, which has to be
// enabled for the game by CrazyGames first. Until a provider is configured, buy() reports that the
// store is not open yet, so nothing is ever charged by accident.
import { crazy } from './crazy.js';

export const payments = {
  // Set by the integration once CrazyGames has enabled purchases for this game:
  // provider(pack) must resolve to true when the purchase is confirmed.
  provider: null,
  get available() { return !!this.provider; },
  async buy(pack) {
    if (!this.provider) {
      return { ok: false, message: crazy.ready ? 'Key packs open soon. Until then: keys drop from monsters on floor 20+.' : 'Key packs are available in the CrazyGames version.' };
    }
    try { return (await this.provider(pack)) ? { ok: true } : { ok: false, message: 'Purchase cancelled' }; }
    catch (e) { return { ok: false, message: 'Purchase failed' }; }
  },
};
