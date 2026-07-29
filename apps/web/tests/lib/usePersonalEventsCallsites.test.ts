// §9 W5 (負の対照) — usePersonalEvents に from/to を渡さない呼び出しがリポジトリ内に 1 つも無い
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §4.2 (from/to 必須) / §9 W5
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** `usePersonalEvents(` の開き括弧に対応する閉じ括弧までを返す */
function callArgs(source: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  return source.slice(openIndex + 1);
}

describe("§9 W5. usePersonalEvents の呼び出し規約", () => {
  it("[W5] 全ての呼び出しが from / to を渡している (定義側を除く)", () => {
    const callSites: Array<{ file: string; args: string }> = [];

    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf8");
      // hook の定義ファイル自体は対象外
      if (/export function usePersonalEvents/.test(source)) continue;
      let from = 0;
      for (;;) {
        const idx = source.indexOf("usePersonalEvents(", from);
        if (idx === -1) break;
        callSites.push({
          file: path.relative(SRC, file),
          args: callArgs(source, idx + "usePersonalEvents".length),
        });
        from = idx + 1;
      }
    }

    // 母数が 0 だとこのテストは無力なので、呼び出しが存在することを先に示す
    expect(callSites.length).toBeGreaterThan(0);

    const missing = callSites.filter((c) => !/\bfrom\b/.test(c.args) || !/\bto\b/.test(c.args));
    expect(missing).toEqual([]);
  });

  it("[T3] semesterId を usePersonalEvents に渡している呼び出しが無い", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf8");
      if (/export function usePersonalEvents/.test(source)) continue;
      let from = 0;
      for (;;) {
        const idx = source.indexOf("usePersonalEvents(", from);
        if (idx === -1) break;
        const args = callArgs(source, idx + "usePersonalEvents".length);
        if (/semesterId/.test(args)) offenders.push(path.relative(SRC, file));
        from = idx + 1;
      }
    }

    expect(offenders).toEqual([]);
  });
});
