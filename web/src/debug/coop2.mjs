// two real browsers in one shop over the code relay (local test broker on :8883)
import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const logs = [];
const open = async (tag) => {
  const p = await browser.newPage({ viewport: { width: 760, height: 470 } });
  p.on('pageerror', (e) => logs.push(tag + ' PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('relay')) logs.push(tag + ' ' + m.text()); });
  await p.goto('http://localhost:5173/?relay=ws://localhost:8883');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await p.evaluate(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 200, level: 3, owned: ['bulb'] }); g.persist(); });
  return p;
};
const A = await open('A'), B = await open('B');
// B tries a code that doesn't exist
await B.evaluate(() => { window.__game.openOnline(); document.querySelector('.op-nick').value = 'Ben'; document.querySelector('.op-code-in').value = 'ZZZZ99'; document.querySelector('.op-join').click(); });
await B.waitForTimeout(5000);
console.log('B bogus:', await B.evaluate(() => document.querySelector('.op-err')?.textContent));
// A creates a lobby
await A.evaluate(() => { window.__game.openOnline(); document.querySelector('.op-nick').value = 'Anna'; document.querySelector('.op-create').click(); });
await A.waitForFunction(() => document.querySelector('.op-c')?.textContent, null, { timeout: 20000 });
const code = await A.evaluate(() => document.querySelector('.op-c').textContent);
console.log('code', code);
await B.evaluate((c) => { document.querySelector('.op-code-in').value = c; document.querySelector('.op-join').click(); }, code);
await B.waitForFunction(() => document.querySelectorAll('.op-pl:not(.empty)').length === 2, null, { timeout: 20000 });
await A.waitForTimeout(800);
await A.screenshot({ path: out + '/lobby_A.png', timeout: 90000 });
await B.screenshot({ path: out + '/lobby_B.png', timeout: 90000 });
await A.evaluate(() => document.querySelector('.op-play').click());
await B.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 }).catch(async () => console.log('B debug', await B.evaluate(() => JSON.stringify({ st: window.__game.state, started: window.__game.online.started, host: [...window.__game.online.remotes.values()].map((r) => [r.isHost, r.state]), peers: window.__game.online.room?.peers().map((p) => p.presence.lobby) })), 'A', await A.evaluate(() => JSON.stringify({ st: window.__game.state, started: window.__game.online.started }))));
console.log('both playing', await A.evaluate(() => window.__game.state), await B.evaluate(() => window.__game.state));
await A.waitForTimeout(5000);
await A.evaluate(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'buzzCut' } }); c.state = 'seated'; g.enterBarber(c, {}); });
await B.evaluate(() => { const g = window.__game; g.player.place({ x: 0.2, z: 1.6 }, 0.0, -0.12); });
await A.waitForTimeout(5000);
await B.screenshot({ path: out + '/coop_B.png', timeout: 90000 });
await A.screenshot({ path: out + '/coop_A.png', timeout: 90000 });
console.log('B sees', await B.evaluate(() => JSON.stringify([...window.__game.online.remotes.values()].map((r) => [r.nick, r.state, !!r.cust, r.ch.root.position.toArray().map((v) => +v.toFixed(2))]))));
// the host leaves: the lobby is gone for B
await A.evaluate(() => window.__game.online.leave());
await B.waitForTimeout(2500);
console.log('B after host left', await B.evaluate(() => [window.__game.online.active, window.__game.state]));
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
