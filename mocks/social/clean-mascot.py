#!/usr/bin/env python3
"""アテンドくん (apps/web/public/character/mascot-*.png) の足元に焼き込まれた地面 (白い板 + 影) を除去し、
透過 PNG を apps/lp/site/img/mascot-*.png に書き出す。再実行可能 (入力は読むだけ)。

元画像は背景除去が不完全で、足元に四角い不透明の地面 (足の間の白 + 青灰色の影) が残り、下端で水平に切れている。
キャラの体は暖色寄りの白〜灰 (R >= G)、地面と影は無彩色〜青寄り (R <= G) なので、色で分けて地面だけを透明にする:

  1. d = R - G を少しぼかす。ground 候補 = (d < T) かつ y >= Y0 (足元の帯) かつ (任意で 明度 >= LMIN)
  2. 候補のうち、各列で「不透明部の最下端まで途切れず続く部分」だけを地面とみなす (足の陰影に誤爆しない)
  3. 地面を 1px 膨らませてから 1px ぼかしたものを alpha から引く (縁に灰色のフリンジを残さない)
  4. 地面を抜いた後に残る小片 (最大連結成分の 0.05% 未満) を消す

使い方: python3 -I mocks/social/clean-mascot.py [name ...]   (name = hello chat idea laptop run。省略で全部)
検証画像: $MASCOT_CHECK_DIR (既定は出力なし) にマゼンタ地へ合成した足元の 3 倍拡大を書く。
"""
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'apps/web/public/character'
OUT = ROOT / 'apps/lp/site/img'

# name: (入力ファイル, T = R-G の上限, Y0 = 足元の帯の上端 (画像高に対する比), LMIN = 地面の最低明度,
#        STRIP = 最下端から数えた「足の下の板」の厚み (画像高比。この帯は無条件で地面),
#        BAND = 最下端の帯の厚み (画像高比。この帯では地面色の候補画素を全て地面にする。足の陰影が地面色に近い画像では 0), MODE)
# MODE: 'legs' = 列ごとの「下端まで続く候補」+ 足の間 (行内で左右にキャラがある) だけを地面にする
#       'plain' = 候補をそのまま地面にする (ノートパソコンのように足元が複雑な画像用)
PARAMS = {
    'hello': ('mascot-hello-1024.png', 0.5, 0.80, 0, 0.013, 0.0, 'legs'),
    'chat': ('mascot-chat.png', 2.0, 0.78, 0, 0.016, 0.04, 'legs'),
    'idea': ('mascot-idea.png', 2.0, 0.78, 0, 0.016, 0.04, 'legs'),
    'laptop': ('mascot-laptop.png', 1.5, 0.70, 185, 0.0, 0.0, 'plain'),
    'run': ('mascot-run.png', 2.0, 0.72, 0, 0.02, 0.08, 'legs'),
}


def clean(name):
    fname, T, y0r, lmin, strip, bandr, mode = PARAMS[name]
    im = Image.open(SRC / fname).convert('RGBA')
    a = np.array(im).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    h, w = al.shape
    ys = np.where(al.max(1) > 16)[0]
    ybot = int(ys.max())
    d = ndi.gaussian_filter(r - g, 1.2)
    lum = (r + g + b) / 3
    yy = np.arange(h)[:, None]
    cand = (d < T) & (yy >= int(h * y0r)) & (al > 8)
    if lmin:
        cand &= ndi.gaussian_filter(lum, 1.0) >= lmin
    cand_c = ndi.binary_closing(cand, structure=np.ones((7, 3), bool), border_value=1)
    if mode == 'plain':
        # 外側 (透明部) に接する成分だけを地面とする (画面内側の白い部分 = ロゴ等は残す)
        lab0, n0 = ndi.label(cand_c, structure=np.ones((3, 3)))
        outside = ndi.binary_dilation(al <= 8, iterations=2)
        outside[0, :] = outside[-1, :] = outside[:, 0] = outside[:, -1] = True
        keep0 = np.unique(lab0[outside & cand_c])
        ground = np.isin(lab0, keep0[keep0 > 0])
    else:
        # 各列で「下端まで候補が途切れず続く部分」だけを地面とする (足の陰影が下の影と連結しても、足の中は抜かない)。
        # (ノイズで途切れても連続とみなすため、縦 7px の closing を掛けてから判定)
        below = np.concatenate([cand_c[:ybot + 1], np.ones((h - ybot - 1, w), bool)])
        suffix = np.flip(np.logical_and.accumulate(np.flip(below, 0), axis=0), 0)
        # 足の間: 同じ行の左右にキャラ (候補でない不透明画素) がある所。足の外側の丸み (影色寄りの陰影) を抜かない
        char = (al > 8) & ~cand_c
        enclosed = np.maximum.accumulate(char, axis=1) & np.flip(np.maximum.accumulate(np.flip(char, 1), axis=1), 1)
        ground = suffix & cand_c & enclosed
        # 足の下の板: 最下端から strip 分は無条件で地面
        ground[max(0, ybot - int(round(h * strip))):] = True
        # 最下端の帯 (画像高の BAND 比。0 なら無効) では、足の外側・角に残る地面色の画素も候補なら地面にする
        band = np.zeros_like(ground)
        band[max(0, ybot - int(round(h * bandr))):] = True
        ground |= band & cand_c
    # 孤立した小片を除く (体の陰影の誤爆)
    lab, n = ndi.label(ground, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndi.sum(np.ones_like(ground), lab, index=range(1, n + 1))
        ground = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= 0.02 * sizes.max()])
    ground = ndi.binary_closing(ground, structure=np.ones((1, 11), bool))  # 地面の縦筋の取り残しを埋める
    ground = ndi.binary_dilation(ground, iterations=1)
    soft = ndi.gaussian_filter(ground.astype(np.float32), 0.9)
    new_al = np.clip(al * (1 - np.clip(soft * 1.6, 0, 1)), 0, 255)
    # 足元の帯だけ alpha に円形 opening を掛け、地面の薄い取り残し (細い帯・筋) を消し、平らに切れた足の角を丸める
    # 円形の footprint なので、足の下端の角 (平らに切れた所) も丸まる
    rad = max(2, round(h * 0.012))
    fy, fx = np.ogrid[-rad:rad + 1, -rad:rad + 1]
    opened = ndi.grey_opening(new_al, footprint=(fx * fx + fy * fy) <= rad * rad)
    new_al = np.where(yy >= int(h * y0r), np.minimum(new_al, opened), new_al)
    # 小片の除去
    lab2, n2 = ndi.label(new_al > 24, structure=np.ones((3, 3)))
    if n2 > 1:
        sizes = ndi.sum(np.ones_like(new_al), lab2, index=range(1, n2 + 1))
        # 吹き出し・電球など体から離れた付属物は残す (最大成分の 0.05% 以上の成分を残す)
        keep2 = [i + 1 for i, sz in enumerate(sizes) if sz >= 0.0005 * sizes.max()]
        new_al = np.where(ndi.binary_dilation(np.isin(lab2, keep2), iterations=2), new_al, 0)
    out = np.dstack([r, g, b, new_al]).clip(0, 255).astype(np.uint8)
    res = Image.fromarray(out)
    OUT.mkdir(parents=True, exist_ok=True)
    res.save(OUT / f'mascot-{name}.png', optimize=True)
    bb = res.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    print(f'mascot-{name}.png {res.size[0]}x{res.size[1]} bbox={bb} ground={int(ground.sum())}px')
    chk = os.environ.get('MASCOT_CHECK_DIR')
    if chk:
        bg = Image.new('RGBA', res.size, (255, 0, 255, 255))
        bg.alpha_composite(res)
        top = int(h * 0.62)
        c = bg.crop((0, top, w, min(h, bb[3] + 12)))
        c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
        c.save(Path(chk) / f'mascot-check-{name}.png')


if __name__ == '__main__':
    names = sys.argv[1:] or list(PARAMS)
    for nm in names:
        clean(nm)
