#!/usr/bin/env bash
# SNS 画像 (1920×1080) と OG 画像 (1200×630) を out/ に書き出し、配布先へコピーする。
# 使い方: bash render.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
test -d ../store/node_modules/puppeteer-core || (cd ../store ; npm i --no-audit --no-fund)
test -f ../../apps/lp/site/fonts/zenmaru.css || { echo "apps/lp/site/fonts が無い (vendor-fonts.py --out で作る)" >&2 ; exit 1 ; }
test -f ../../apps/lp/site/img/hero-phones.webp || python3 -I extract-phones.py
node render.mjs
sips -g pixelWidth -g pixelHeight out/*.png | grep -E "png|pixel" | paste - - -
mkdir -p ../../assets/social/1.0.1
cp out/hero-1920x1080.png out/og-1200x630.png ../../assets/social/1.0.1/
cp out/og-1200x630.png ../../apps/lp/site/og-1200x630.png
