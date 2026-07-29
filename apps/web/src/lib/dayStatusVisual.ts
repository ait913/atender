import type { AttendanceDaySummary } from "@atender/shared";

/** severity 順。この配列の順が背景セグメント順・グリフ選択順の唯一の定義。 */
export const DAY_MARK_ORDER = ["absent", "excused", "tardy", "suspended", "present", "unrecorded"] as const;
export type DayMarkKind = (typeof DAY_MARK_ORDER)[number];

export type DayVisualIcon = "check" | "x" | "excused" | "clock" | "ban" | "minus";

export type DayMark = {
  kind: DayMarkKind;
  count: number;        // 1 以上
  icon: DayVisualIcon;
  iconColor: string;    // "var(--color-status-absent)" 等
  tint: string;         // "color-mix(in srgb, var(--color-status-absent) 26%, var(--color-bg-elevated))"
  dotColor: string;     // ドット用の素の色トークン
};

export type DayVisual = {
  marks: DayMark[];     // severity 順。count===0 のものは含まない
  dashed: boolean;
};

type MarkStyle = {
  icon: DayVisualIcon;
  iconColor: string;
  tintToken: string;
  tintPercent: string;
  dotColor: string;
};

const MARK_STYLE: Record<DayMarkKind, MarkStyle> = {
  absent: {
    icon: "x",
    iconColor: "var(--color-status-absent)",
    tintToken: "var(--color-status-absent)",
    tintPercent: "26%",
    dotColor: "var(--color-status-absent)",
  },
  excused: {
    icon: "excused",
    iconColor: "var(--color-status-excused)",
    tintToken: "var(--color-status-excused)",
    tintPercent: "22%",
    dotColor: "var(--color-status-excused)",
  },
  tardy: {
    icon: "clock",
    iconColor: "var(--color-status-tardy)",
    tintToken: "var(--color-status-tardy)",
    tintPercent: "24%",
    dotColor: "var(--color-status-tardy)",
  },
  suspended: {
    icon: "ban",
    iconColor: "var(--color-status-suspended)",
    tintToken: "var(--color-status-suspended)",
    tintPercent: "20%",
    dotColor: "var(--color-status-suspended)",
  },
  present: {
    icon: "check",
    iconColor: "var(--color-status-present)",
    tintToken: "var(--color-status-present)",
    tintPercent: "20%",
    dotColor: "var(--color-status-present)",
  },
  unrecorded: {
    icon: "minus",
    iconColor: "var(--color-fg-tertiary)",
    tintToken: "var(--color-status-none)",
    tintPercent: "12%",
    dotColor: "var(--color-status-none)",
  },
};

function mark(kind: DayMarkKind, count: number): DayMark {
  const style = MARK_STYLE[kind];
  return {
    kind,
    count,
    icon: style.icon,
    iconColor: style.iconColor,
    tint: `color-mix(in srgb, ${style.tintToken} ${style.tintPercent}, var(--color-bg-elevated))`,
    dotColor: style.dotColor,
  };
}

function buildMarks(byKind: Record<DayMarkKind, number>): DayMark[] {
  const marks: DayMark[] = [];
  for (const kind of DAY_MARK_ORDER) {
    const count = byKind[kind];
    if (count > 0) marks.push(mark(kind, count));
  }
  return marks;
}

/** counts を持たない旧 API 向けの legacy 経路 (§4.4)。 */
function legacyVisual(status: AttendanceDaySummary["status"] | undefined, future: boolean): DayVisual {
  if (status === "ALL_SUSPENDED") {
    return { marks: [mark("suspended", 1)], dashed: false };
  }
  if (future) return { marks: [], dashed: false };
  if (status === "ALL_PRESENT") return { marks: [mark("present", 1)], dashed: false };
  if (status === "HAS_ABSENT") return { marks: [mark("absent", 1)], dashed: false };
  if (status === "HAS_TARDY") return { marks: [mark("tardy", 1)], dashed: false };
  if (status === "PARTIAL_UNRECORDED") return { marks: [mark("unrecorded", 1)], dashed: true };
  return { marks: [], dashed: false };
}

export function dayVisual(
  summary: AttendanceDaySummary | undefined,
  opts: { future?: boolean } = {},
): DayVisual {
  if (!summary) return { marks: [], dashed: false };
  const future = opts.future === true;
  const counts = summary.counts;
  if (!counts) return legacyVisual(summary.status, future);

  const unrecorded = future ? 0 : counts.unrecorded;
  const marks = buildMarks({
    absent: counts.absent,
    excused: counts.excused,
    tardy: counts.tardy + counts.earlyLeave,
    suspended: counts.suspended,
    present: counts.present,
    unrecorded,
  });
  return { marks, dashed: unrecorded > 0 };
}

function stop(ratio: number): string {
  return `${Math.round(ratio * 1_000_000) / 10_000}%`;
}

/** marks から CSS background を 1 文字列で組む。marks が空なら "" */
export function dayBackground(marks: DayMark[]): string {
  const total = marks.reduce((sum, item) => sum + item.count, 0);
  if (total <= 0) return "";
  const stops: string[] = [];
  let cursor = 0;
  for (const item of marks) {
    const from = stop(cursor / total);
    cursor += item.count;
    const to = stop(cursor / total);
    stops.push(`${item.tint} ${from}`, `${item.tint} ${to}`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** セルに描くグリフ (severity 順に先頭 2 件)。 */
export function dayGlyphs(marks: DayMark[]): DayMark[] {
  return marks.slice(0, 2);
}
