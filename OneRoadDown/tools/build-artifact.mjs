// Writes the Claude Artifact page (index.html without the document skeleton) and
// prints the supporting-file map used to publish the playable build.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] || path.join(root, 'tools', 'artifact.html');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'))
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
const files = {};
const walk = (d) => { for (const f of fs.readdirSync(path.join(root, d))) { const p = path.join(d, f); if (fs.statSync(path.join(root, p)).isDirectory()) walk(p); else if (/\.(js|css|woff2)$/.test(f)) files[p] = p; } };
['css', 'fonts', 'vendor', 'src'].forEach(walk);
console.log(JSON.stringify(files));
