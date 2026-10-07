// Turns the Vite build (dist/) into a self-contained page for a claude.ai Artifact:
// CSS, fonts and JS inlined into one HTML body fragment; the 3D models ship next to it.
import fs from 'fs';
import path from 'path';

const dist = 'dist', out = 'artifact';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const cssFile = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
let css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
// fonts as data URIs
css = css.replace(/url\(\.\.\/fonts\/([^)]+)\)/g, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(dist, 'fonts', f)).toString('base64')})`);
const js = fs.readFileSync(path.join(dist, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const title = html.match(/<title>.*?<\/title>/)[0];
const bootStyle = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const embed = `<script>window.__EMBED_ASSETS={${['props', 'characters'].map((k) => `${k}:"${fs.readFileSync(path.join(dist, 'assets', k + '.glb')).toString('base64')}"`).join(',')}};</script>`;
const page = `${title}\n<style>:root{color-scheme:dark}</style>\n${bootStyle}\n<style>${css}</style>\n${body}\n${embed}\n<script type="module">\n${js}\n</script>\n`;
fs.writeFileSync(path.join(out, 'index.html'), page);
console.log('artifact/index.html', (page.length / 1024).toFixed(0) + ' KB');
