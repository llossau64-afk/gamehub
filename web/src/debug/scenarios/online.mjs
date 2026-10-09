// online co-op with a mocked room: two remote barbers cutting at the extra chairs
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  // without the runtime: the panel explains how to get colleagues in
  await ev(() => { window.__game.openOnline(); });
  await step(0.5);
  await snap('n_off');
  await ev(() => { window.__game.ui.closePanel(); window.__game.online.available = null; });
  await ev(() => {
    const listeners = [];
    const look = { colors: { Skin: '#9a6644', Top: '#7a2a26', Sleeve: '#9a6644', Pants: '#34404f', Shoes: '#e8e2d6', Hair: '#1a1410', Iris: '#5c4632', EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da' }, accessories: ['tee'], scale: 1, hairColor: '#1a1410' };
    const look2 = { ...look, colors: { ...look.colors, Skin: '#f1c9a5', Top: '#2f4a3a', Sleeve: '#2f4a3a', Hair: '#c9a26a' }, accessories: ['hoodie', 'glasses'], hairColor: '#c9a26a' };
    window.__peers = [
      { peer: 'zz1', isMe: false, presence: { v: 1, nick: 'Kemal', st: 'barber', p: [-0.6, -0.75, 0.3], cu: { id: 'a', look }, hr: [0.5, 0.45, 0.2, 0.2, 0.25] } },
      { peer: 'zz2', isMe: false, presence: { v: 1, nick: 'Jonas<script>', st: 'barber', p: [-0.9, -0.6, 0], cu: { id: 'b', look: look2 }, hr: [0.7, 0.6, 0.5, 0.5, 0.5] } },
    ];
    const me = { peer: 'aa0', isMe: true, presence: {} };
    const room = {
      peers: () => [me, ...window.__peers],
      onPeers: (fn) => { listeners.push(fn); return () => {}; },
      presence: async (patch) => { Object.assign(me.presence, patch); window.__myPresence = { ...me.presence }; },
      leave: async () => {},
    };
    window.__pushPeers = () => listeners.forEach((f) => f({ peers: room.peers() }));
    const lobbyL = [];
    const lobby = { join: async () => room, onPeers: (fn) => { lobbyL.push(fn); setTimeout(() => fn({ peers: [{ peer: 'zz1', isMe: false, presence: { shop: 'KIEZ', nick: 'Kemal' } }, { peer: 'zz2', isMe: false, presence: { shop: 'KIEZ', nick: 'Jonas' } }] }), 50); return () => {}; }, presence: async (p) => { window.__lobbyMe = p; } };
    window.claude = { use: async (n) => (n === 'room' ? lobby : null) };
  });
  await ev(() => { window.__game.openOnline(); });
  await new Promise((r) => setTimeout(r, 300));
  await step(0.3);
  await snap('n0_panel');
  await ev(() => { document.querySelector('.op-nick').value = 'Lukas'; document.querySelector('.op-sj').click(); });
  await new Promise((r) => setTimeout(r, 1800));
  await step(0.5);
  await snap('n1_menu');
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(3);
  await ev(() => { const g = window.__game; g.player.place({ x: 0.2, z: 1.6 }, 0.0, -0.12); });
  await step(1); await snap('n2_shop');
  await ev(() => { const g = window.__game; g.player.place({ x: 4.6, z: 2.25 }, 0.25, -0.15); });
  await step(2.5); await snap('n3_annex');
  console.log('ext', await ev(() => JSON.stringify({ has: window.__game.shop.has('extension'), pos: window.__game.player.pos, annex: window.__game.shop.slots.annex.visible })));
  // they cut: hair gets shorter, one walks off
  await ev(() => { window.__peers[0].presence = { ...window.__peers[0].presence, hr: [0.1, 0.12, 0.03, 0.03, 0.05] }; window.__peers[1].presence = { ...window.__peers[1].presence, st: 'play', p: [1.5, 1.0, 1.0], cu: null }; window.__pushPeers(); });
  await ev(() => { const g = window.__game; g.player.place({ x: 0.2, z: 1.6 }, 0.0, -0.12); });
  await step(2); await snap('n4_after');
  console.log(await ev(() => JSON.stringify({ mine: window.__myPresence, remotes: [...window.__game.online.remotes.values()].map((r) => [r.nick, r.slot, r.state, !!r.cust]), badge: document.querySelector('.online-badge')?.textContent, lobby: window.__lobbyMe })));
};
