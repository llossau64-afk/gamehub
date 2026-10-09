// screenshot of the loading screen at a fixed progress.  node src/debug/boot.mjs <out.png> [w] [h]
import { chromium } from 'playwright-core';
const [, , out, w = 1440, h = 900] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
await page.route(/src\/main\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: "import './ui/ui.css';" }));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
await page.evaluate(() => { const b = document.getElementById('boot'); b.querySelector('.track i').style.width = '58%'; b.querySelector('.sc').style.left = '58%'; b.querySelector('.hair').style.setProperty('--p', '58%'); b.querySelector('.pct').textContent = '58%'; b.querySelector('.t').textContent = 'Unpacking the chairs'; });
await page.waitForTimeout(600);
await page.screenshot({ path: out });
await browser.close();
