import { chromium } from 'playwright-core';
const [, , path, expr] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5173' + path);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
console.log(await page.evaluate(expr));
await browser.close();
