/**
 * build 21 AW11 / 設計 doc §10.3.1 (デプロイ 1 の privacy.html / terms.html 移行期文言)。
 * 公開 HTML は成果物なので文字列検査の対象。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = path.resolve(__dirname, "../../public");
const read = (slug: string) => fs.readFileSync(path.join(publicDir, `${slug}.html`), "utf8");

// 本文テキスト (タグ除去 + 空白正規化)。改行折り返し・インライン要素に影響されないように比べる
const text = (slug: string) =>
  read(slug)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "");

describe("[B21 AW11] privacy.html", () => {
  it("「終了した機能のデータ」の箇条があり、§10.3.1 の文言を含む", () => {
    const t = text("privacy");
    for (const s of [
      "終了した機能のデータ：",
      "個人の予定の登録、iPhoneのカレンダーからの読み込み、カレンダーファイル（ICS）の取り込み、Googleカレンダー連携、ルームへの予定の追加と個人カレンダーの共有は、提供を終了しました。",
      "これらで保存していたデータ（予定のタイトル・日時・場所・メモ、読み込んだ予定の識別子、取り込んだファイルの本文、Googleのカレンダー名と予定）は、提供終了に伴い削除します。",
      "授業をiPhoneの「Atender」カレンダーへ書き出す機能は端末内で動作し、カレンダーの内容をサーバーに送信しません。",
    ]) {
      expect(t, s).toContain(s.replace(/\s+/g, ""));
    }
  });

  it("置換前の 4 箇条の見出しと、削除された文言が残っていない", () => {
    const t = text("privacy");
    for (const s of [
      "iPhoneのカレンダーから読み込んだ予定",
      "取り込んだカレンダー",
      "読み込むカレンダーはiOSアプリの設定から変更できます",
      "Googleカレンダー連携：",
      "やGoogleカレンダーと連携した場合",
      "ルームに追加した予定",
      "ルームへの個人カレンダーの共有設定",
      "ルームに個人カレンダーを共有した場合",
      "カレンダーの取り込み元",
      "ルームに共有していた個人の予定とGoogleカレンダーの予定は削除します",
    ]) {
      expect(t, s).not.toContain(s);
    }
  });

  it("Google は「サインイン」用途として残り、Google Fonts の記載も残る", () => {
    const t = text("privacy");
    expect(t).toContain("Googleでのサインインに利用します");
    expect(t).toContain("GoogleFonts");
  });

  it("制定日の日付が ISO 形式で入っている (改定日がデプロイ 1 の日付以降)", () => {
    const dates = [...read("privacy").matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})">/g)].map((m) => m[1]);
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates[dates.length - 1] >= "2026-10-29").toBe(true);
  });
});

describe("[B21 AW11] terms.html", () => {
  it("「友達やルームでの時間割の共有」に置換され、予定とカレンダー管理の文言が無い", () => {
    const t = text("terms");
    expect(t).toContain("友達やルームでの時間割の共有");
    expect(t).not.toContain("予定とカレンダーの管理");
    expect(t).not.toContain("友達やルームでの予定の共有");
    expect(t).not.toContain("読み込むカレンダーはiOSアプリの設定から変更できます");
  });
});

describe("[B21 AW11] 3 ページ共通", () => {
  it.each(["privacy", "terms", "support"])("%s.html に撤去機能を現役として謳う文言が無い", (slug) => {
    const t = text(slug);
    for (const s of ["読み込むカレンダーはiOSアプリの設定から変更できます", "Googleカレンダーと連携", "ICSを取り込"]) {
      expect(t, s).not.toContain(s);
    }
  });
});
