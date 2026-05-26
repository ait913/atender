export const statusLabels = {
  PRESENT: "出",
  ABSENT: "欠",
  EXCUSED: "公",
  TARDY: "遅",
  EARLY_LEAVE: "早",
  CANCELLED: "休",
} as const;

export const statusLongLabels = {
  PRESENT: "出席",
  ABSENT: "欠席",
  EXCUSED: "公欠",
  TARDY: "遅刻",
  EARLY_LEAVE: "早退",
  CANCELLED: "休講",
} as const;

export const ruleLabels = {
  COUNT_AS_PRESENT: "出席扱い",
  COUNT_AS_ABSENT: "欠席扱い",
  HALF_PRESENT: "半分出席",
  REDUCE_DENOMINATOR: "分母除外",
  SEPARATE_COUNT: "別集計",
} as const;

export function minutesToTime(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
