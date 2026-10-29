#!/usr/bin/env python3
"""LP 用のマスコット 3 ポーズ (hello / chat / run) を apps/lp/site/img/mascot-*.png から WebP に縮小する。
正典: .designs/20261030-landing-page-v2-layout.md §6 (寸法は表示幅の 2 倍以上)。元の PNG は SNS 画像が参照するので消さない。
使い方: python3 -I mocks/social/mascot-webp.py"""
from pathlib import Path
from PIL import Image

IMG = Path(__file__).resolve().parents[2] / 'apps/lp/site/img'
POSES = {'hello': 400, 'chat': 403, 'run': 355}

for name, width in POSES.items():
    im = Image.open(IMG / f'mascot-{name}.png').convert('RGBA')
    if im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(IMG / f'mascot-{name}.webp', 'WEBP', quality=90, method=6)
    print(f'mascot-{name}.webp {im.width}x{im.height}')
