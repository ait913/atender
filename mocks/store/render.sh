#!/usr/bin/env bash
# App Store プレビュー画像を out/<copy>-<theme>/slide-N.png に書き出す。
# 使い方: bash render.sh [theme=light] [copy=a] [slides=1,2,3,4,5]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
THEME="${1:-light}"
COPY="${2:-a}"
SLIDES="${3:-1,2,3,4,5}"
test -d node_modules/puppeteer-core || npm i --no-audit --no-fund
test -f fonts/zenmaru.css || python3 -I vendor-fonts.py zenmaru
node render.mjs "$SLIDES" "$THEME" "$COPY"
sips -g pixelWidth -g pixelHeight out/"$COPY-$THEME"/slide-*.png | grep -E "slide|pixel" | paste - - -
