#!/bin/sh
# usage: tools/shot.sh "<query string>" out.png [width height]
#   e.g. tools/shot.sh "level=yeast&demo=120" out.png            desktop 1440x860
#        tools/shot.sh "level=yeast&demo=120" out.png 390 844    phone portrait (rendered in an iframe; Chrome windows cannot be < 500 px wide)
# Loads index.html straight from disk in headless Google Chrome (no server needed, safe to run in parallel).
DIR="$(cd "$(dirname "$0")/.." && pwd)"; W=${3:-1440}; H=${4:-860}
if [ "$W" -lt 500 ]; then
  Q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "unlock&$1")
  URL="file://$DIR/tools/frame.html?w=$W&h=$H&q=$Q"; WW=500
else URL="file://$DIR/index.html?unlock&$1"; WW=$W; fi
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --user-data-dir="$(mktemp -d)" --window-size=$WW,$H --virtual-time-budget=5000 --screenshot="$2" "$URL" >/dev/null 2>&1
if [ "$W" -lt 500 ]; then sips -c $H $W --cropOffset 1 1 "$2" >/dev/null 2>&1; fi
