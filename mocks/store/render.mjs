// App Store プレビュー画像の書き出し (puppeteer-core + Google Chrome)。
// 使い方: node render.mjs [slides=1,2,3,4,5] [theme=light] [copy=a]
// Chrome の --screenshot は macOS でプロセスが終了しない (2026-10-09 実測) ので CDP で駆動する。
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

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

function findChrome() {
  const root = join(process.env.HOME, '.cache/chrome-devtools-mcp/browsers/chrome');
  if (existsSync(root)) {
    for (const v of readdirSync(root).sort().reverse()) {
      const p = join(root, v, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (existsSync(p)) return p;
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

const out = join(here, 'out', `${copy}-${theme}`);
mkdirSync(out, { recursive: true });
const GOOGLE_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function launch(executablePath) {
  return puppeteer.launch({
    executablePath,
    headless: true,
    timeout: 15000,
    args: ['--hide-scrollbars', '--disable-background-networking', '--no-first-run'],
  });
}
// Chrome for Testing 148 はこの Mac で起動後に CDP が応答しなくなる (2026-10-09 実測、
// chrome-devtools MCP も同症状)。既定は普段使いの Chrome を別プロファイル (puppeteer の
// 一時 dir、ユーザーのプロファイルには触れない) で使う。CHROME=cft で Chrome for Testing を試す。
const exe = process.env.CHROME === 'cft' ? findChrome() : (process.env.CHROME || GOOGLE_CHROME);
const browser = await launch(exe);
let failed = false;
try {
  const browserPage = await browser.newPage();
  await browserPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  for (const n of slides) {
    const url = pathToFileURL(join(here, 'index.html')).href + `?slide=${n}&theme=${theme}&copy=${copy}`;
    const file = join(out, `slide-${n}.png`);
    try {
      await browserPage.goto(url, { waitUntil: 'load' });
      await browserPage.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout: 30000 });
      const { fontLoaded, missing } = await browserPage.evaluate(() => ({
        fontLoaded: document.documentElement.dataset.fontLoaded,
        missing: document.documentElement.dataset.missing,
      }));
      // 素材やフォントが欠けた場合は撮影せず、残りのスライドを確認する。
      if (fontLoaded !== 'true' || missing !== '[]') {
        failed = true;
        console.error(`${file}: 書き出し中止 (fontLoaded=${fontLoaded}, missing=${missing})`);
        continue;
      }
      await browserPage.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
      console.log(`${file} (fontLoaded=true)`);
    } catch (error) {
      failed = true;
      console.error(`${file}: 書き出し失敗`, error);
    }
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
