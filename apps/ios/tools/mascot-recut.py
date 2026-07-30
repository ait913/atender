#!/usr/bin/env python3
"""Atender マスコットを原画シートから再切り出しする (alpha 破損の是正 + 接地影の除去)。
usage: python3 tools/mascot-recut.py <sheet.png> <outdir>
requires: opencv-python, pillow, numpy
"""
import sys, cv2, numpy as np
from PIL import Image

WHITE_MIN = 246       # これより明るい画素を「白」とみなす
FADE_PX = 6           # 脚の下端フェード幅
DROP_PX = 2           # 脚の下端の切り捨て
FEATHER_SIGMA = 0.7   # alpha の 1px フェザー (白背景の anti-alias の代替)
PAD = 48              # 正方 canvas の余白 (native px)

# name, x0, x1, y0, y1 (シート上の窓), shadowTop (この絶対行から下は接地影), out (出力の一辺)
POSES = [
    ("mascot-hello-1024",  420, 1120,   0,  515, 483, 1024),
    ("mascot-chat",          0,  420, 540, 1024, 850,  403),
    ("mascot-run",         420,  780, 540, 1024, 846,  355),
    ("mascot-laptop",      780, 1115, 540, 1024, 866,  313),
    ("mascot-idea",       1115, 1536, 540, 1024, 850,  406),
]

def foreground(rgb):
    """白背景を落とす。★外周に連結した白だけを背景とし、輪の内側の白は前景に残す"""
    white = (rgb.min(axis=2) > WHITE_MIN).astype(np.uint8)
    _, lab = cv2.connectedComponents(white, connectivity=4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    return ~(np.isin(lab, list(border)) & (white == 1))

def cut(rgb, fg, x0, x1, y0, y1, shadow_top, out):
    win = rgb[y0:y1, x0:x1]
    m = fg[y0:y1, x0:x1]
    top = shadow_top - y0
    keep = m.copy()
    keep[top:, :] = False
    alive = m[top - 1, :].copy()           # 影帯の 1 行上で立っている列 = 脚
    for y in range(top, m.shape[0]):
        col = alive & m[y, :]
        keep[y, col] = True
        alive = col
        if not col.any():
            break
    a = keep.astype(np.uint8) * 255
    ys = np.where((a > 0).any(axis=1))[0]
    bottom = int(ys.max())
    for i in range(DROP_PX):
        a[bottom - i, :] = 0
    b = bottom - DROP_PX
    for i in range(FADE_PX):
        y = b - i
        if y < 0:
            break
        a[y, :] = (a[y, :].astype(np.float32) * (i + 1) / (FADE_PX + 1)).astype(np.uint8)
    a = cv2.GaussianBlur(a, (0, 0), FEATHER_SIGMA)
    ys, xs = np.where(a > 0)
    ay0, ay1, ax0, ax1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop_rgb, crop_a = win[ay0:ay1, ax0:ax1], a[ay0:ay1, ax0:ax1]
    h, w = crop_a.shape
    side = max(h, w) + PAD
    canvas = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - h) // 2, (side - w) // 2
    canvas[oy:oy + h, ox:ox + w, :3] = crop_rgb
    canvas[oy:oy + h, ox:ox + w, 3] = crop_a
    return Image.fromarray(canvas).resize((out, out), Image.LANCZOS)

def holes(img):
    """外周に連結しない alpha==0 の 4-連結成分 (= 穴) → (個数, 総面積, 最大面積)"""
    a = np.array(img)[..., 3]
    t = (a == 0).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(t, connectivity=4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    hs = [int(stats[i][4]) for i in range(1, n) if i not in border]
    return len(hs), sum(hs), (max(hs) if hs else 0)

if __name__ == "__main__":
    sheet, outdir = sys.argv[1], sys.argv[2]
    rgb = np.array(Image.open(sheet).convert("RGB"))
    fg = foreground(rgb)
    for name, x0, x1, y0, y1, st, out in POSES:
        img = cut(rgb, fg, x0, x1, y0, y1, st, out)
        path = f"{outdir}/{name}.png"
        img.save(path)
        c, tot, mx = holes(img)
        print(f"{name}: {out}x{out} holes={c} total={tot} ({tot / (out * out) * 100:.4f}%) max={mx} -> {path}")
