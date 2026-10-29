export type CourseRuleValues = { requiredAttendanceRate: number | null; maxAbsences: number | null; tardiesPerAbsence: number | null };

export function footnote(rateOn: boolean, maxOn: boolean, userRate: number, rate?: number | null): string {
  if (rateOn && maxOn) return "出席率と回数の厳しい方で「あと何回休めるか」を出します";
  if (rateOn) return `この科目は ${rate ?? userRate}% で判定します`;
  if (maxOn) return "この科目は回数の上限で判定します（共通の必要出席率は使いません）";
  return `未設定の項目は共通の必要出席率（${userRate}%）で判定します`;
}

export function summary(rule: CourseRuleValues, userRate: number): string {
  const parts: string[] = [];
  if (rule.requiredAttendanceRate == null && rule.maxAbsences == null) parts.push(`共通（${userRate}%）`);
  if (rule.requiredAttendanceRate != null) parts.push(`出席率 ${rule.requiredAttendanceRate}%`);
  if (rule.maxAbsences != null) parts.push(`欠席 ${rule.maxAbsences} 回まで`);
  if (rule.tardiesPerAbsence != null) parts.push(`遅刻・早退 ${rule.tardiesPerAbsence} 回で欠席 1 回`);
  return parts.join(" ・ ");
}
