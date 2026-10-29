正典は [.designs/20261030-landing-page-and-social-image.md](../../.designs/20261030-landing-page-and-social-image.md) §4・§6。

atender ルートで:

```sh
python3 -I mocks/social/extract-phones.py                         # ストア画像 (assets/store/1.0.1) から端末を透過で切り出し → apps/lp/site/img/*.webp
python3 -I mocks/social/clean-mascot.py                           # マスコット (apps/web/public/character) の足元の地面と影を除去 → apps/lp/site/img/mascot-*.png (影は index.html の CSS で描く)
python3 -I mocks/store/vendor-fonts.py zenmaru --out apps/lp/site/fonts   # フォントの同梱 (初回のみ)
bash mocks/social/render.sh                                       # SNS 画像 3 枚 (hero / friends 1920×1080 + OG 1200×630。全てマスコット入り、friends は index.html?variant=friends) → assets/social/1.0.1/ と apps/lp/site/og-1200x630.png (OG は hero の上下 36px を落として縮小)
node mocks/social/lp-shots.mjs [baseUrl]                          # LP のスクショ + 崩れ検査
```
