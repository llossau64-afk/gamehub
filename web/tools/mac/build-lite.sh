#!/usr/bin/env bash
# Small universal macOS app (~2 MB): a launcher that opens the single-file game in its own
# Chrome/Edge/Brave app window when one of them is installed, otherwise in the default browser.
# needs: genisoimage, python3 + Pillow.   ./build-lite.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$HERE/../.."
WORK="${WORK:-/tmp/barber-mac}"
OUT="${OUT:-$WEB/release}"
mkdir -p "$WORK" "$OUT"
[ -f "$WEB/artifact/index.html" ] || (cd "$WEB" && npm run artifact)
VERSION="$(node -p "require('$WEB/package.json').version")"
python3 "$HERE/make_icon.py" "$WORK/icon"
STAGE="$WORK/stage-lite"; rm -rf "$STAGE"
APP="$STAGE/dmg/Barber Empire.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$WEB/artifact/index.html" "$APP/Contents/Resources/index.html"
cp "$WORK/icon.icns" "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/MacOS/BarberEmpire" <<'SH'
#!/bin/bash
# Opens the game in a browser app window (no tabs, no address bar) when possible.
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
URL="file://$(printf '%s' "$RES/index.html" | sed -e 's/%/%25/g' -e 's/ /%20/g')"
for B in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium" "Vivaldi" "Arc"; do
  if open -Ra "$B" >/dev/null 2>&1; then
    open -na "$B" --args --app="$URL" --window-size=1440,860 --autoplay-policy=no-user-gesture-required
    exit 0
  fi
done
open "$URL"
SH
chmod 755 "$APP/Contents/MacOS/BarberEmpire"
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Barber Empire</string>
  <key>CFBundleDisplayName</key><string>Barber Empire</string>
  <key>CFBundleIdentifier</key><string>com.barberempire.launcher</string>
  <key>CFBundleExecutable</key><string>BarberEmpire</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.simulation-games</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PL
ln -s /Applications "$STAGE/dmg/Applications"
genisoimage -quiet -V "Barber Empire" -R -D -l -allow-lowercase -allow-multidot -relaxed-filenames -no-pad -o "$STAGE/raw.iso" "$STAGE/dmg"
python3 "$HERE/udif.py" "$STAGE/raw.iso" "$OUT/BarberEmpire-$VERSION-mac.dmg" "Barber Empire"
