// usage: node src/debug/shot.mjs "<url path>" out.png [w h]
import { chromium } from 'playwright-core';
const [, , path, out, w = '900', h = '700'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' ' + (e.stack||'').split('\n').slice(1,4).join(' | ')));
await page.goto((process.env.BASE || 'http://localhost:5173') + path);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => logs.push('TIMEOUT waiting ready'));
await page.waitForTimeout(+(process.env.WAIT || 1500));
await page.screenshot({ path: out });
console.log([...new Set(logs.filter((l) => !l.includes("[vite]")))].slice(0, 30).join("\n"));
await browser.close();
