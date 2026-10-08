// Browser race test:  node tools/race.mjs <outdir> <mapId> <frames> [tag]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [out, map = 'jp-sakura', frames = '240', tag = 'r'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +(process.env.W || 640), height: +(process.env.H || 360) } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text().slice(0, 300)); });
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
await p.addInitScript((car) => localStorage.setItem('oneroaddown.save.v1', JSON.stringify({ firstStartDone: true, owned: ['rusty', 'kestrel', car], selected: car, cash: 50000, cars: {}, races: 20 })), process.env.CAR || 'kestrel');
await p.goto(`http://localhost:8080/index.html?bot&fixed&race=${map}&opp=${process.env.OPP || 5}`);
await p.waitForFunction(() => document.querySelector('#boot.ready'), null, { timeout: 200000 });
await p.keyboard.press('Space');
await p.waitForFunction(() => window.__game.run && window.__game.run.active, null, { timeout: 200000 });
const n = +frames;
for (let i = 0; i < 3; i++) {
  await p.waitForFunction((k) => { const g = window.__game; g.__f = (g.__f || 0) + 1; return g.__f > k; }, n * (i + 1) / 3, { polling: 'raf', timeout: 300000 }).catch(() => {});
  await p.screenshot({ path: `${out}/${tag}_${i}.png`, timeout: 150000 });
}
const info = await p.evaluate(() => { const r = window.__game.run; return { t: r.raceTime.toFixed(1), field: r.order.map((e) => `${e.pos}:${e.name}:${e.car.id}:lap${e.lap}:${Math.round(e.progress)}m:${e.vehicle.kmh.toFixed(0)}kmh`), calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles }; });
logs.push('INFO ' + JSON.stringify(info));
console.log(logs.slice(0, 30).join('\n'));
await b.close();
