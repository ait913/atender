import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync(path.resolve(__dirname, "../../public/privacy.html"), "utf8");

describe("[LG] privacy.html after AIS Mail migration", () => {
  it("[LG1] no Resend", () => {
    expect(html).not.toContain("Resend");
  });
  it("[LG2] Cloudflare li mentions login mail and recipient address", () => {
    const li = /<li><strong>Cloudflare[^<]*<\/strong>.*?<\/li>/s.exec(html)?.[0];
    expect(li).toBeTruthy();
    expect(li).toContain("ログイン用メール");
    expect(li).toContain("宛先のメールアドレス");
  });
  it("[LG3] #L4 replacement phrase present, Resend absent", () => {
    expect(html).toContain("ログイン用メール（メールアドレスでのログイン）の送信");
  });
  it("[LG4] revision date is the deploy date 2026-10-30", () => {
    expect(html).toMatch(/改定日：<time datetime="2026-10-30">2026-10-30<\/time>/);
  });
});
