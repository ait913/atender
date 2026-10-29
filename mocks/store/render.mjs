// App Store プレビュー画像の書き出し (puppeteer-core + Google Chrome)。
// 使い方: node render.mjs [slides=1,2,3,4,5] [theme=light] [copy=a]
// Chrome の起動と撮影は shoot.mjs (mocks/social と共用)。
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, capture } from './shoot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const slides = (process.argv[2] || '1,2,3,4,5').split(',').map(Number);
const theme = process.argv[3] || 'light';
const copy = process.argv[4] || 'a';
const W = 1320, H = 2868;
if (!['light', 'dark'].includes(theme) || !['a', 'b'].includes(copy)
    || slides.some(n => !Number.isInteger(n) || n < 1 || n > 5)) {
  console.error('使い方: node render.mjs [slides=1,2,3,4,5] [theme=light|dark] [copy=a|b]');
  process.exit(2);
}

const out = join(here, 'out', `${copy}-${theme}`);
mkdirSync(out, { recursive: true });
const browser = await launchChrome();
let failed = false;
try {
  const browserPage = await browser.newPage();
  await browserPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  for (const n of slides) {
    const url = pathToFileURL(join(here, 'index.html')).href + `?slide=${n}&theme=${theme}&copy=${copy}`;
    const file = join(out, `slide-${n}.png`);
    const ok = await capture(browserPage, url, { file, clip: { x: 0, y: 0, width: W, height: H } });
    if (!ok) failed = true;
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
