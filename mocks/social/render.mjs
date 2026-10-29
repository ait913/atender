// SNS 画像 (1920×1080) と OG 画像 (1200×630) の書き出し。
// 使い方: node render.mjs   (引数なし)
// 正典: .designs/20261030-landing-page-and-social-image.md §4-3。Chrome 駆動は ../store/shoot.mjs。
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, capture } from '../store/shoot.mjs';

if (process.argv.length > 2) {
  console.error('使い方: node render.mjs (引数なし)');
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(here, 'index.html')).href;
const browser = await launchChrome();
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  // OG は同じ HTML の上下 36px を落として 1.905:1 にする (1920 × .625 = 1200、1008 × .625 = 630)
  const jobs = [
    { file: join(out, 'hero-1920x1080.png'), clip: { x: 0, y: 0, width: 1920, height: 1080 } },
    { file: join(out, 'og-1200x630.png'), clip: { x: 0, y: 36, width: 1920, height: 1008, scale: 0.625 } },
  ];
  for (const job of jobs) {
    if (!(await capture(page, url, job))) failed = true;
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
