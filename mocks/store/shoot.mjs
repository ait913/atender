// Chrome 起動・ready 待ち・撮影の共通部 (mocks/store と mocks/social が共用)。
// 正典: .designs/20261030-landing-page-and-social-image.md §4-4
// Chrome の --screenshot は macOS でプロセスが終了しない (2026-10-09 実測) ので CDP で駆動する。
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

export const GOOGLE_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function findChrome() {
  const root = join(process.env.HOME, '.cache/chrome-devtools-mcp/browsers/chrome');
  if (existsSync(root)) {
    for (const v of readdirSync(root).sort().reverse()) {
      const p = join(root, v, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (existsSync(p)) return p;
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

// Chrome for Testing 148 はこの Mac で起動後に CDP が応答しなくなる (2026-10-09 実測、
// chrome-devtools MCP も同症状)。既定は普段使いの Chrome を別プロファイル (puppeteer の
// 一時 dir、ユーザーのプロファイルには触れない) で使う。CHROME=cft で Chrome for Testing を試す。
export async function launchChrome() {
  const exe = process.env.CHROME === 'cft' ? findChrome() : (process.env.CHROME || GOOGLE_CHROME);
  return puppeteer.launch({
    executablePath: exe,
    headless: true,
    timeout: 15000,
    args: ['--hide-scrollbars', '--disable-background-networking', '--no-first-run'],
  });
}

// 素材やフォントが欠けた場合は撮影せず false を返す (呼び出し側が残りを続けて最後に exit 1)。
export async function capture(page, url, { file, clip }) {
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout: 30000 });
    const { fontLoaded, missing } = await page.evaluate(() => ({
      fontLoaded: document.documentElement.dataset.fontLoaded,
      missing: document.documentElement.dataset.missing,
    }));
    if (fontLoaded !== 'true' || missing !== '[]') {
      console.error(`${file}: 書き出し中止 (fontLoaded=${fontLoaded}, missing=${missing})`);
      return false;
    }
    await page.screenshot({ path: file, clip });
    console.log(`${file} (fontLoaded=true)`);
    return true;
  } catch (error) {
    console.error(`${file}: 書き出し失敗`, error);
    return false;
  }
}
