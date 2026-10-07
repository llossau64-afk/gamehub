#!/usr/bin/env bash
# Builds "Barber Empire.app" (Electron shell around artifact/index.html) for Apple Silicon
# and Intel, ad-hoc signs it with rcodesign and packs each into a compressed .dmg.
# needs: genisoimage, python3 + Pillow, rcodesign, and the Electron darwin zips.
#   WORK=/tmp/mac ELECTRON=33.2.1 RCODESIGN=/path/to/rcodesign ./build-dmg.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$HERE/../.."
WORK="${WORK:-/tmp/barber-mac}"
EV="${ELECTRON:-33.2.1}"
RCODESIGN="${RCODESIGN:-rcodesign}"
OUT="${OUT:-$WEB/release}"
mkdir -p "$WORK" "$OUT"
[ -f "$WEB/artifact/index.html" ] || (cd "$WEB" && npm run artifact)
python3 "$HERE/make_icon.py" "$WORK/icon"
VERSION="$(node -p "require('$WEB/package.json').version")"
for ARCH in arm64 x64; do
  ZIP="$WORK/electron-$ARCH.zip"
  [ -f "$ZIP" ] || curl -sSL -o "$ZIP" "https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-darwin-$ARCH.zip"
  STAGE="$WORK/stage-$ARCH"; rm -rf "$STAGE"; mkdir -p "$STAGE/unz"
  (cd "$STAGE/unz" && unzip -q "$ZIP")
  APP="$STAGE/dmg/Barber Empire.app"
  mkdir -p "$STAGE/dmg"
  mv "$STAGE/unz/Electron.app" "$APP"
  RES="$APP/Contents/Resources"
  rm -f "$RES/default_app.asar"
  mkdir -p "$RES/app"
  cp "$WEB/artifact/index.html" "$HERE/main.js" "$RES/app/"
  printf '{"name":"barber-empire","productName":"Barber Empire","version":"%s","main":"main.js"}\n' "$VERSION" > "$RES/app/package.json"
  cp "$WORK/icon.icns" "$RES/electron.icns"
  python3 - "$APP/Contents/Info.plist" "$VERSION" <<'PY'
import plistlib, sys
p, ver = sys.argv[1], sys.argv[2]
d = plistlib.load(open(p, 'rb'))
d.update({'CFBundleName': 'Barber Empire', 'CFBundleDisplayName': 'Barber Empire', 'CFBundleIdentifier': 'com.barberempire.game',
          'CFBundleShortVersionString': ver, 'CFBundleVersion': ver, 'LSApplicationCategoryType': 'public.app-category.simulation-games',
          'NSHumanReadableCopyright': 'Barber Empire'})
plistlib.dump(d, open(p, 'wb'))
PY
  "$RCODESIGN" sign "$APP" > "$STAGE/sign.log" 2>&1 || { tail -20 "$STAGE/sign.log"; exit 1; }
  ln -s /Applications "$STAGE/dmg/Applications"
  genisoimage -quiet -V "Barber Empire" -R -D -l -allow-lowercase -allow-multidot -relaxed-filenames -no-pad -o "$STAGE/raw.iso" "$STAGE/dmg"
  NAME="BarberEmpire-$VERSION-mac-$([ "$ARCH" = arm64 ] && echo apple-silicon || echo intel).dmg"
  python3 "$HERE/udif.py" "$STAGE/raw.iso" "$OUT/$NAME" "Barber Empire"
done
ls -la "$OUT"
