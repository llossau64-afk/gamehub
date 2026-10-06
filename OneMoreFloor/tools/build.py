#!/usr/bin/env python3
"""Builds a single self-contained dist/index.html (code, three.js, fonts and CSS inlined).
Upload that file (zipped) to CrazyGames or any HTML5 portal. Needs Node for esbuild:
    python3 tools/build.py
"""
import base64, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
os.makedirs(DIST, exist_ok=True)
bundle = os.path.join(DIST, 'game.js')
subprocess.run(['npx', '-y', 'esbuild@0.24.0', os.path.join(ROOT, 'js', 'main.js'), '--bundle', '--minify',
                '--format=iife', '--target=es2020', '--outfile=' + bundle], check=True)
css = open(os.path.join(ROOT, 'css', 'style.css')).read()
css = re.sub(r"url\(\.\./fonts/([^)]+)\)", lambda m: "url(data:font/woff2;base64," + base64.b64encode(
    open(os.path.join(ROOT, 'fonts', m.group(1)), 'rb').read()).decode() + ")", css)
html = open(os.path.join(ROOT, 'index.html')).read()
html = re.sub(r'<link rel="preload"[^>]*>\n', '', html)
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
js = open(bundle).read()
if '</script' in js:
    sys.exit('bundle contains </script')
html = html.replace('<script type="module" src="js/main.js"></script>', '<script>\n' + js + '\n</script>')
open(os.path.join(DIST, 'index.html'), 'w').write(html)
os.remove(bundle)
print('wrote', os.path.join(DIST, 'index.html'), round(len(html) / 1024), 'KB')
