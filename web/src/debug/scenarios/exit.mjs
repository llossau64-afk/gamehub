// the owner's exit: stroll out, stop, "!", back to the door, line, run off out of sight
export default async ({ step, snap, ev, until }) => {
  await step(0.5);
  await ev(() => { window.__game.newGame(); });
  await until(() => window.__game.state === 'intro');
  const st = () => ev(() => { const o = window.__game.owner; return o ? { x: o.root.position.x, z: o.root.position.z, vis: o.visible, ex: window.__game.exclaim.list.length, sub: document.querySelector('.subs .line')?.textContent || '' } : null; });
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    await step(0.25);
    const s = await st();
    if (!s) break;
    const mark = async (k) => { if (!seen.has(k)) { seen.add(k); await snap(k); console.log(k, JSON.stringify(s)); } };
    if (s.z > 2.4 && !seen.has('outside')) await mark('outside');
    if (s.ex && !seen.has('exclaim')) { await step(0.25); await mark('exclaim'); }
    if (seen.has('exclaim') && s.sub.includes('customers')) await mark('line');
    if (seen.has('line') && s.x < 0.5) await mark('run1');
    if (seen.has('run1') && s.x < -3) await mark('run2');
    if (seen.has('run2') && s.x < -7) await mark('run3');
    if (!s.vis) { console.log('hidden at', JSON.stringify(s)); break; }
  }
};
