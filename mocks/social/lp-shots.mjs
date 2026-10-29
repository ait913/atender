// LP のスクショ + 崩れ検査 (横スクロール・画像読み込み・フォント・hero バッジの位置)。
// 使い方: node lp-shots.mjs [baseUrl=http://127.0.0.1:18080/]
// 出力: <repo>/.tmp/lp-shots/<幅>.png (.tmp/ は .gitignore 済み)。正典: .designs/20261030-landing-page-and-social-image.md §7-2
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../store/shoot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] || 'http://127.0.0.1:18080/';
const out = join(here, '../../.tmp/lp-shots');
mkdirSync(out, { recursive: true });
const browser = await launchChrome();
let failed = false;
const fail = (width, msg) => { failed = true; console.error(`[${width}px] NG: ${msg}`); };
try {
  const page = await browser.newPage();
  for (const width of [320, 375, 1280]) {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
    await page.goto(baseUrl, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      brokenImages: Array.from(document.images).filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')),
      fontOk: document.fonts.check('900 44px "Zen Maru Gothic"', 'もう出席率で'),
      badgeBottom: document.querySelector('.hero .store-badge').getBoundingClientRect().bottom,
    }));
    if (r.scrollWidth !== r.clientWidth) fail(width, `横スクロール (scrollWidth=${r.scrollWidth}, clientWidth=${r.clientWidth})`);
    if (r.brokenImages.length) fail(width, `画像の読み込み失敗 ${JSON.stringify(r.brokenImages)}`);
    if (!r.fontOk) fail(width, 'Zen Maru Gothic が使えていない');
    if (width === 375 && r.badgeBottom > 667) fail(width, `hero のバッジ下端 ${r.badgeBottom} > 667`);
    const file = join(out, `${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${file} (scrollWidth=${r.scrollWidth}/${r.clientWidth}, badgeBottom=${r.badgeBottom})`);
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
