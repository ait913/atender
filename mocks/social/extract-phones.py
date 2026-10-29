#!/usr/bin/env python3
"""ストア画像 (assets/store/1.0.1/slide-N.png) から端末部分を透過で切り出し、LP 用 WebP にする。
正典: .designs/20261030-landing-page-and-social-image.md §4-1。定数は mocks/store/index.html の .phone.* から。"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'assets/store/1.0.1'
MASCOT = ROOT / 'apps/ios/Atender/Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png'
OUT = ROOT / 'apps/lp/site/img'
W, H = 1320, 2868
RING = 5
SS = 4


def load(n):
    return Image.open(SRC / f'slide-{n}.png').convert('RGBA')


def rr(size, box, radius):
    w, h = size
    m = Image.new('L', (w * SS, h * SS), 0)
    x0, y0, x1, y1 = box
    ImageDraw.Draw(m).rounded_rectangle((x0 * SS, y0 * SS, x1 * SS, y1 * SS), radius=radius * SS, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def save(im, name, width=None):
    if width is not None and im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(OUT / f'{name}.webp', 'WEBP', quality=88, method=6)
    print(f'{name}.webp {im.width}x{im.height}')


def hero():
    pair = Image.new('RGBA', (2 * W, H))
    pair.paste(load(1), (0, 0))
    pair.paste(load(2), (W, 0))
    pw = 1535
    ph = pw * H / W
    t = rr((2 * W, H + 2000), (414 - RING, 1010 - RING, 414 + pw + RING, 1010 + ph + RING), pw * .17 + RING)
    t = t.rotate(8, resample=Image.BICUBIC, center=(414 + pw / 2, 1010)).crop((0, 0, 2 * W, H))  # CSS rotate(-8deg) = 画面上で反時計回り = PIL の +8
    fw = 501
    fh = fw * H / W
    f = rr((2 * W, H), (2034 - RING, 1677 - RING, 2034 + fw + RING, 1677 + fh + RING), 85 + RING)
    mask = ImageChops.lighter(t, f)
    pair.putalpha(mask)
    save(pair.crop(mask.getbbox()), 'hero-phones', 1200)


def floating():
    fw = 501
    fh = fw * H / W
    im = load(2)
    m = rr((W, H), (714 - RING, 1677 - RING, 714 + fw + RING, 1677 + fh + RING), 85 + RING)
    im.putalpha(m)
    save(im.crop(m.getbbox()), 'phone-2')


def straight(n, donor=None):
    im = load(n)
    if donor is not None:
        # 3・4 枚目は円バッジ (下端 y 1058) の縁と影が上ベゼルに掛かる。バッジの無い 5 枚目の同じ行で置き換える
        # (y 1046〜1085 はベゼルと黒縁だけで画面は y 1086 から。5 枚目のマスコットの可視部は y 1013 で終わる)
        im.paste(donor.crop((128, 1046, 1192, 1086)), (128, 1046))
    sw = 1054
    sh = sw * H / W
    m = rr((W, H + 400), (133 - RING, 1051 - RING, 133 + sw + RING, 1051 + sh + RING), sw * .17 + RING).crop((0, 0, W, H))
    im.putalpha(m)
    save(im.crop(m.getbbox()), f'phone-{n}', 720)


def mascot():
    save(Image.open(MASCOT).convert('RGBA'), 'mascot-hello', 400)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    hero()
    floating()
    s5 = load(5)
    straight(3, s5)
    straight(4, s5)
    straight(5)
    mascot()
