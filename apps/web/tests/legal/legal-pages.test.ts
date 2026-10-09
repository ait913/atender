import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = path.resolve(__dirname, "../../public");
const PAGES = [
  { slug: "privacy", title: "プライバシーポリシー | Atender" },
  { slug: "terms", title: "利用規約 | Atender" },
  { slug: "support", title: "サポート | Atender" },
] as const;

function read(slug: string) {
  return fs.readFileSync(path.join(publicDir, `${slug}.html`), "utf8");
}

describe("[B20 #L] legal pages (static content)", () => {
  it.each(PAGES)("#L1 $slug.html exists with lang / charset / viewport / title", ({ slug, title }) => {
    expect(fs.existsSync(path.join(publicDir, `${slug}.html`))).toBe(true);
    const html = read(slug);
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain(`<title>${title}</title>`);
  });

  it.each(PAGES)("#L2 $slug.html has no external dependency", ({ slug }) => {
    const html = read(slug);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
    const values: string[] = [];
    for (const m of html.matchAll(/\b(?:src|href|srcset)=("([^"]*)"|'([^']*)')/g)) values.push(m[2] ?? m[3]);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      // srcset may hold "url descriptor" pairs; check each url token
      for (const url of v.split(",").map((s) => s.trim().split(/\s+/)[0])) {
        const ok = url.startsWith("/") || url.startsWith("https://atender.appily.run/") || url.startsWith("mailto:");
        expect(ok, `external reference: ${url}`).toBe(true);
      }
    }
  });

  it.each(PAGES)("#L3 $slug.html has mailto + footer links with aria-current only on itself", ({ slug }) => {
    const html = read(slug);
    expect(html).toContain('href="mailto:touri.development@gmail.com"');
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    const anchors = [...footer.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]);
    for (const target of ["/privacy", "/terms", "/support"]) {
      const a = anchors.find((attrs) => attrs.includes(`href="${target}"`));
      expect(a, `footer link ${target}`).toBeDefined();
      if (target === `/${slug}`) expect(a).toContain('aria-current="page"');
      else expect(a).not.toContain("aria-current");
    }
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
  });

  it("#L4 privacy.html carries the required disclosures", () => {
    const html = read("privacy");
    for (const s of [
      "Atender 運営者",
      "iPhoneのカレンダーから読み込んだ予定",
      "サーバーに送信して保存します",
      "IPアドレス",
      "Resend",
      "Cloudflare",
      "Google Fonts",
      "日本国内",
      "一定期間データが残ることがあります",
      "設定 → その他 → アカウントを削除",
      "作成者との紐付けを外して残します",
      "トラッキングは行いません",
      "Cookie",
    ]) {
      expect(html, s).toContain(s);
    }
  });

  it("#L5 terms.html and support.html carry the required phrases", () => {
    const terms = read("terms");
    for (const s of ["日本法", "学校の公式な記録や判定に代わるものではありません", "/privacy"]) expect(terms, s).toContain(s);
    const support = read("support");
    for (const s of ["アカウントを削除", "プライバシーとセキュリティ", "https://atender.appily.run/"]) expect(support, s).toContain(s);
  });

  it.each(PAGES)("#L6 $slug.html has a concrete YYYY-MM-DD 制定日", ({ slug }) => {
    const html = read(slug);
    expect(html).not.toContain("2026-10-XX");
    expect(html).toMatch(/制定日/);
    const m = /<time datetime="([^"]*)">([^<]*)<\/time>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(m![1]))).toBe(false);
    expect(m![2]).toBe(m![1]);
  });
});
