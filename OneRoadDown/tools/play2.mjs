// Browser test with the autopilot: start at a distance, drive, capture.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [out, sArg = '40', frames = '120', tag = 'p'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await p.goto('http://localhost:8080/index.html');
await p.evaluate(() => { localStorage.setItem('oneroaddown.save.v1', JSON.stringify({ firstStartDone: true, owned: ['rusty', 'kestrel'], selected: process_sel, cash: 50000, cars: {} })); }).catch(() => {});
await p.evaluate((sel) => localStorage.setItem('oneroaddown.save.v1', JSON.stringify({ firstStartDone: true, owned: ['rusty', 'kestrel', 'dusty'], selected: sel[0], cash: 50000, cars: {}, settings: sel[1] ? { camera: sel[1] } : {} })), [process.env.CAR || 'kestrel', process.env.CAM || '']);
await p.goto(`http://localhost:8080/index.html?bot&fixed&s=${sArg}`);
await p.waitForFunction(() => document.querySelector('#boot.ready'), null, { timeout: 90000 });
await p.keyboard.press('Space');
await p.waitForFunction(() => window.__game.state === 'menu', null, { timeout: 30000 });
await p.screenshot({ path: `${out}/${tag}_menu.png` });
await p.click('[data-a=continue]');
await p.waitForFunction(() => window.__game.run && window.__game.run.active, null, { timeout: 200000 });
const n = +frames;
for (let i = 0; i < 3; i++) {
  await p.waitForFunction((k) => { const g = window.__game; g.__f = (g.__f || 0) + 1; return g.__f > k; }, n * (i + 1) / 3, { polling: 'raf', timeout: 120000 }).catch(() => {});
  await p.screenshot({ path: `${out}/${tag}_${i}.png`, timeout: 150000 });
}
const info = await p.evaluate(() => { const g = window.__game; const r = g.run; const v = r.vehicle; return { state: g.state, s: r.maxS, kmh: v.kmh, hp: v.hp / v.p.hpPool, fuel: v.fuel, ended: r.ended, fps: r.fps, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, chunks: g.world.chunks.size }; });
logs.push('INFO ' + JSON.stringify(info));
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await b.close();
