export default async ({ step, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 2000, level: 5, owned: [] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); for (let i = 0; i < 3; i++) g.customers.spawnStatic({ seatIndex: i, phone: true }); g.customers.spawnStatic({ chair: true }); g.player.place({ x: 1.6, z: 1.9 }, 0.75, -0.12); });
  await step(1);
  console.log(await ev(() => {
    const g = window.__game;
    const cats = {};
    let vis = 0, tris = 0, shadow = 0;
    g.scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isSprite)) return;
      vis++;
      const idx = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
      const t = idx / 3 * (o.isInstancedMesh ? o.count : 1);
      tris += t;
      if (o.castShadow) shadow++;
      let p = o; let k = 'other';
      while (p) { if (p.name && p.name.startsWith('P_')) { k = p.name; break; } if (p.isSkinnedMesh) { k = 'character'; break; } p = p.parent; }
      if (o.material?.type === 'ShaderMaterial') k = 'shader:' + (o.parent?.name || '');
      cats[k] = cats[k] || [0, 0]; cats[k][0]++; cats[k][1] += t;
    });
    const top = Object.entries(cats).sort((a, b) => b[1][1] - a[1][1]).slice(0, 25).map(([k, v]) => `${k}:${v[0]}/${Math.round(v[1])}`);
    return JSON.stringify({ vis, tris: Math.round(tris), shadow, top }, null, 0);
  }));
};
