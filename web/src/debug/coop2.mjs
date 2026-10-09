// two real browsers in one shop over the code relay (local test broker on :8883)
import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const logs = [];
const open = async (tag) => {
  const p = await browser.newPage({ viewport: { width: 1100, height: 680 } });
  p.on('pageerror', (e) => logs.push(tag + ' PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') logs.push(tag + ' ' + m.text()); });
  await p.goto('http://localhost:5173/?relay=ws://localhost:8883');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await p.evaluate(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 200, level: 3, owned: ['bulb'] }); g.persist(); });
  return p;
};
const A = await open('A'), B = await open('B');
// A opens the shop via the panel, B types the code
await A.evaluate(async () => { await window.__game.openOnline(); document.querySelector('.op-nick').value = 'Anna'; document.querySelector('.op-code-in').value = 'test42'; document.querySelector('.op-join').click(); });
await B.evaluate(async () => { await window.__game.openOnline(); document.querySelector('.op-nick').value = 'Ben'; document.querySelector('.op-code-in').value = 'TEST42'; document.querySelector('.op-join').click(); });
await A.waitForTimeout(4000);
console.log('A remotes', await A.evaluate(() => JSON.stringify([...window.__game.online.remotes.values()].map((r) => r.nick))));
console.log('B remotes', await B.evaluate(() => JSON.stringify([...window.__game.online.remotes.values()].map((r) => r.nick))));
await A.evaluate(() => window.__game.continueGame());
await B.evaluate(() => window.__game.continueGame());
await A.waitForTimeout(5000);
await A.evaluate(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'buzzCut' } }); c.state = 'seated'; g.enterBarber(c, {}); });
await B.evaluate(() => { const g = window.__game; g.player.place({ x: 0.2, z: 1.6 }, 0.0, -0.12); });
await A.waitForTimeout(5000);
await B.screenshot({ path: out + '/coop_B.png' });
await A.screenshot({ path: out + '/coop_A.png' });
console.log('B sees', await B.evaluate(() => JSON.stringify([...window.__game.online.remotes.values()].map((r) => [r.nick, r.state, !!r.cust, r.ch.root.position.toArray().map((v) => +v.toFixed(2))]))));
await B.evaluate(() => window.__game.online.leave());
await A.waitForTimeout(1500);
console.log('A after B left', await A.evaluate(() => window.__game.online.remotes.size));
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
