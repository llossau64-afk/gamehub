// Scripted playthrough in headless Chromium.  node src/debug/play.mjs <scenario> <outdir>
import { chromium } from 'playwright-core';
import fs from 'fs';
const [, , scenario = 'intro', out = '/tmp/claude-0/shots/play'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const mobile = !!process.env.MOBILE;
const page = await browser.newPage(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
await page.goto((process.env.BASE || 'http://localhost:5173/') + '?manual' + (process.env.Q ? '&q=' + process.env.Q : ''));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
const step = (sec, dt = 1 / 30) => page.evaluate(([n, dt]) => window.__step(n, dt, false), [Math.round(sec / dt), dt]);
let shot = 0;
const snap = async (name) => { await page.evaluate(() => window.__step(1, 1 / 60, true)); await page.screenshot({ path: `${out}/${String(shot++).padStart(2, '0')}_${name}.png` }); };
const ev = (f, a) => page.evaluate(f, a);
// keep stepping (game time) until a condition holds; real-time UI waits get to finish too
const until = async (cond, maxSec = 30) => {
  for (let t = 0; t < maxSec; t += 0.25) {
    if (await page.evaluate(cond)) return true;
    await step(0.25);
    await page.waitForTimeout(30);
  }
  console.log('until timeout: ' + cond);
  return false;
};
globalThis.ctx = { page, step, snap, ev, until };
const mod = await import('./scenarios/' + scenario + '.mjs');
try { await mod.default(globalThis.ctx); } catch (e) { logs.push('SCENARIO ERROR: ' + e.message); }
console.log([...new Set(logs)].slice(0, 40).join('\n'));
await browser.close();
