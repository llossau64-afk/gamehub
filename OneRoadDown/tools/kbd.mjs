import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
const logs = [];
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
await p.goto('http://localhost:8080/index.html');
await p.evaluate(() => localStorage.setItem('oneroaddown.save.v1', JSON.stringify({ firstStartDone: true, owned: ['rusty'], selected: 'rusty', cash: 3000, cars: {} })));
await p.goto('http://localhost:8080/index.html?fixed');
await p.waitForFunction(() => document.querySelector('#boot.ready'), null, { timeout: 120000 });
await p.keyboard.press('Enter');
await p.waitForFunction(() => window.__game.state === 'menu', null, { timeout: 30000 });
await p.waitForTimeout(1500);
const k = async (key, w = 600) => { await p.keyboard.press(key); await p.waitForTimeout(w); };
await k('ArrowDown'); // GARAGE
logs.push('focus ' + await p.evaluate(() => document.activeElement.textContent.trim()));
await k('Enter', 6000);
logs.push('state ' + await p.evaluate(() => window.__game.state));
await k('Enter', 4000); // buy selected engine
logs.push('engine lvl ' + await p.evaluate(() => window.__game.save.data.cars.rusty.levels.engine));
await k('KeyE', 2000);
logs.push('tab ' + await p.evaluate(() => window.__game.tab));
await p.screenshot({ path: `${out}/k_garage.png` });
await k('Escape', 4000);
logs.push('state ' + await p.evaluate(() => window.__game.state));
console.log(logs.join('\n'));
await b.close();
