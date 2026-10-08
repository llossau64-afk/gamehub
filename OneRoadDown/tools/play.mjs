// Automated smoke test: boot, pick first car, drive, screenshot key states.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const out = process.argv[2] || '.';
const clear = process.argv.includes('--fresh');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await p.goto('http://localhost:8080/index.html');
if (clear) { await p.evaluate(() => localStorage.clear()); await p.reload(); }
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); };
await p.waitForTimeout(9000); await shot('01_boot');
await p.keyboard.press('Space');
await p.waitForTimeout(4000); await shot('02_after');
const state = await p.evaluate(() => window.__game && window.__game.state);
logs.push('STATE ' + state);
if (state === 'first') {
  await p.click('.arrow[data-d="1"]'); await p.waitForTimeout(2500); await shot('03_first');
  await p.click('.sel-btn'); await p.waitForTimeout(9000); await shot('04_count');
} else if (state === 'menu') {
  await shot('03_menu');
  await p.click('[data-a=continue]'); await p.waitForTimeout(6000); await shot('04_count');
}
await p.keyboard.down('KeyW'); await p.waitForTimeout(5000); await shot('05_drive');
await p.waitForTimeout(5000); await shot('06_drive2');
await p.keyboard.up('KeyW');
const info = await p.evaluate(() => { const g = window.__game; const r = g.run; return r ? { s: r.maxS, kmh: r.vehicle.kmh, fps: r.fps, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles } : null; });
logs.push('INFO ' + JSON.stringify(info));
console.log(logs.slice(0, 40).join('\n'));
await b.close();
