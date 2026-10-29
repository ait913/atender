#!/usr/bin/env python3
"""Google Fonts の woff2 を mocks/store/fonts/ に取り込み、ローカル参照の CSS を書く。

headless Chrome は --virtual-time-budget とネット経由の Web フォントの組み合わせで
ハングするので (2026-10-09 実測)、フォントはファイルで持つ。
使い方: python3 -I vendor-fonts.py zenmaru  # 指定フォントを取り込む
"""
import re
import sys
import urllib.request
from pathlib import Path

FONTS = {
    'zenmaru': 'Zen+Maru+Gothic:wght@500;700;900',
}
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')
ROOT = Path(__file__).resolve().parent / 'fonts'


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def vendor(key: str, query: str) -> None:
    css = fetch(f'https://fonts.googleapis.com/css2?family={query}&display=swap').decode()
    out_dir = ROOT / key
    out_dir.mkdir(parents=True, exist_ok=True)
    n = 0

    def repl(m: re.Match) -> str:
        nonlocal n
        url = m.group(1)
        name = f'{n:03d}.woff2'
        n += 1
        path = out_dir / name
        if not path.exists():
            path.write_bytes(fetch(url))
        return f'url({key}/{name})'

    local_css = re.sub(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', repl, css)
    (ROOT / f'{key}.css').write_text(local_css)
    print(f'{key}: {n} files -> {ROOT / (key + ".css")}')


if __name__ == '__main__':
    keys = sys.argv[1:] or list(FONTS)
    for k in keys:
        vendor(k, FONTS[k])
