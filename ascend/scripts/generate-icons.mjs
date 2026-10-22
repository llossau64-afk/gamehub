// Renders ASCEND's original app icons from SVG using Playwright/Chromium.
// Usage: node scripts/generate-icons.mjs  (needs Playwright + Chromium available)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const pw = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(pw);

// Emblem: an upward chevron ("ascend") inside a faceted hexagon crest.
const emblem = (stroke, fill, glow = true) => `
  ${glow ? `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8B5CF6" stop-opacity=".55"/><stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/></radialGradient>
  <linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C4B5FD"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>
  <circle cx="512" cy="512" r="380" fill="url(#g)"/>` : ''}
  <polygon points="512,190 790,350 790,674 512,834 234,674 234,350" fill="${fill}" stroke="${stroke}" stroke-width="22" stroke-linejoin="round"/>
  <path d="M352 600 L512 410 L672 600" fill="none" stroke="${glow ? 'url(#l)' : stroke}" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M412 690 L512 572 L612 690" fill="none" stroke="${stroke}" stroke-opacity=".55" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>`;

const svg = (size, body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`;

const files = {
  'icon.png': [1024, svg(1024, emblem('#C9CED8', '#12121A'), '#07070B')],
  'splash-icon.png': [1024, svg(1024, emblem('#C9CED8', '#12121A'))],
  'android-icon-foreground.png': [512, svg(512, `<g transform="translate(512 512) scale(.72) translate(-512 -512)">${emblem('#C9CED8', '#12121A')}</g>`)],
  'android-icon-background.png': [512, svg(512, '', '#07070B')],
  'android-icon-monochrome.png': [432, svg(432, `<g transform="translate(512 512) scale(.72) translate(-512 -512)">${emblem('#FFFFFF', 'none', false)}</g>`)],
  'favicon.png': [48, svg(48, emblem('#C9CED8', '#12121A'), '#07070B')],
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [name, [size, markup]] of Object.entries(files)) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  const buf = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(join(OUT, name), buf);
  console.log(name, size);
}
await browser.close();
