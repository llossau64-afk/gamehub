import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const outDir = process.argv[2];
const html = fs.readFileSync(new URL('./bake.html', import.meta.url), 'utf8');
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => console.log('console', m.text()));
await p.route('http://127.0.0.1:8099/__bake.html', (r) => r.fulfill({ contentType: 'text/html', body: html }));
await p.goto('http://127.0.0.1:8099/__bake.html');
await p.waitForFunction(() => window.bakeReady, null, { timeout: 60000 });
const list = await p.evaluate(() => window.bake());
fs.mkdirSync(outDir, { recursive: true });
const meta = [];
for (const t of list) {
  fs.writeFileSync(`${outDir}/${t.name}.png`, Buffer.from(t.url.split(',')[1], 'base64'));
  const { url, ...m } = t; meta.push(m);
}
fs.writeFileSync(`${outDir}/../generated_meta.json`, JSON.stringify(meta, null, 1));
console.log('baked', list.length);
await b.close();
