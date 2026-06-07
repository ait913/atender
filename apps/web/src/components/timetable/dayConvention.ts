/** JS標準 0=日..6=土 を 表示系 1=月..7=日 に変換 */
export function jsDowToDisplay(jsDow: number): number {
  return ((jsDow + 6) % 7) + 1;
}

/** 表示系 1=月..7=日 を JS標準 0=日..6=土 に変換 */
export function displayDowToJs(displayDow: number): number {
  return displayDow % 7;
}

/** 設定曜日 ∪ 授業が存在する曜日 を表示系 1..7 昇順で返す */
export function resolveDisplayDays(tt: { daysOfWeek: number[]; meetings: { dayOfWeek: number }[] }): number[] {
  const set = new Set<number>(tt.daysOfWeek.length ? tt.daysOfWeek : [1, 2, 3, 4, 5]);
  for (const m of tt.meetings) set.add(jsDowToDisplay(m.dayOfWeek));
  return [...set].sort((a, b) => a - b);
}
