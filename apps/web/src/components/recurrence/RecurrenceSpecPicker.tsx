import type { RecurrenceSpec } from "@atender/shared";
import { Field } from "@/components/ui";

const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;
type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type RecurrencePresetKind =
  | "none" | "daily" | "weekly" | "weekday" | "monthlyByMonthDay" | "monthlyByDay" | "yearly" | "custom";

export function weekdayCodeOf(start: Date): WeekdayCode {
  return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const)[start.getDay()] as WeekdayCode;
}

export function sortWeekdays(codes: string[]): WeekdayCode[] {
  return WEEKDAY_CODES.filter((code) => codes.includes(code));
}

export function weekdayLabel(code: string): string {
  const index = WEEKDAY_CODES.indexOf(code as WeekdayCode);
  return index >= 0 ? WEEKDAY_LABELS[index]! : code;
}

export function ordinalOf(start: Date): number {
  return Math.floor((start.getDate() - 1) / 7) + 1;
}

export function specForPreset(preset: RecurrencePresetKind, start: Date): RecurrenceSpec | null {
  const end = { kind: "never" } as const;
  switch (preset) {
    case "daily": return { freq: "DAILY", interval: 1, byDay: [], monthlyMode: null, end };
    case "weekly": return { freq: "WEEKLY", interval: 1, byDay: [weekdayCodeOf(start)], monthlyMode: null, end };
    case "weekday": return { freq: "WEEKLY", interval: 1, byDay: ["MO", "TU", "WE", "TH", "FR"], monthlyMode: null, end };
    case "monthlyByMonthDay": return { freq: "MONTHLY", interval: 1, byDay: [], monthlyMode: "BYMONTHDAY", end };
    case "monthlyByDay": return { freq: "MONTHLY", interval: 1, byDay: [], monthlyMode: "BYDAY", end };
    case "yearly": return { freq: "YEARLY", interval: 1, byDay: [], monthlyMode: null, end };
    default: return null;
  }
}

export function presetForSpec(spec: RecurrenceSpec | null, start: Date): RecurrencePresetKind {
  if (!spec) return "none";
  const candidates: RecurrencePresetKind[] = ["daily", "weekly", "weekday", "monthlyByMonthDay", "monthlyByDay", "yearly"];
  for (const candidate of candidates) {
    const expected = specForPreset(candidate, start);
    if (expected ? JSON.stringify(expected) === JSON.stringify(spec) : false) return candidate;
  }
  return "custom";
}

/** 表示文の正典 (iOS RecurrenceSpecLogic.describe と 1 文字も違わないこと) */
export function describeSpec(spec: RecurrenceSpec | null, start: Date): string {
  if (!spec) return "繰り返しなし";
  const base = baseText(spec, start);
  if (spec.end.kind === "until") return `${base} ・${spec.end.date.replaceAll("-", "/")} まで`;
  if (spec.end.kind === "count") return `${base} ・${spec.end.count}回`;
  return base;
}

function baseText(spec: RecurrenceSpec, start: Date): string {
  if (spec.freq === "DAILY") return spec.interval === 1 ? "毎日" : `${spec.interval}日ごと`;
  if (spec.freq === "WEEKLY") {
    const days = sortWeekdays(spec.byDay.length > 0 ? spec.byDay : [weekdayCodeOf(start)]);
    if (spec.interval === 1) {
      if (days.join(",") === "MO,TU,WE,TH,FR") return "毎週 平日";
    }
    const labels = days.map(weekdayLabel).join(", ");
    return spec.interval === 1 ? `毎週 ${labels}` : `${spec.interval}週ごと ${labels}`;
  }
  if (spec.freq === "MONTHLY") {
    const prefix = spec.interval === 1 ? "毎月" : `${spec.interval}ヶ月ごと`;
    if (spec.monthlyMode === "BYDAY") {
      const ord = ordinalOf(start);
      return `${prefix} ${ord === 5 ? "最終" : `第${ord}`}${weekdayLabel(weekdayCodeOf(start))}曜`;
    }
    return `${prefix} ${start.getDate()}日`;
  }
  const prefix = spec.interval === 1 ? "毎年" : `${spec.interval}年ごと`;
  return `${prefix} ${start.getMonth() + 1}月${start.getDate()}日`;
}

function presetLabel(kind: RecurrencePresetKind, start: Date): string {
  switch (kind) {
    case "none": return "なし";
    case "daily": return "毎日";
    case "weekly": return `毎週 ${weekdayLabel(weekdayCodeOf(start))}`;
    case "weekday": return "毎週 平日";
    case "monthlyByMonthDay": return `毎月 ${start.getDate()}日`;
    case "monthlyByDay": {
      const ord = ordinalOf(start);
      return `毎月 ${ord === 5 ? "最終" : `第${ord}`}${weekdayLabel(weekdayCodeOf(start))}曜`;
    }
    case "yearly": return `毎年 ${start.getMonth() + 1}月${start.getDate()}日`;
    default: return "カスタム…";
  }
}

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function RecurrenceSpecPicker({ value, onChange, start }: {
  value: RecurrenceSpec | null;
  onChange: (next: RecurrenceSpec | null) => void;
  start: Date;
}) {
  const preset = presetForSpec(value, start);
  const presets: RecurrencePresetKind[] =
    ["none", "daily", "weekly", "weekday", "monthlyByMonthDay", "monthlyByDay", "yearly", "custom"];

  return (
    <Field label="繰り返し">
      <select
        aria-label="繰り返し"
        className="min-h-12 w-full rounded-2xl bg-bg-muted px-4 text-sm font-bold"
        value={preset}
        onChange={(e) => {
          const next = e.currentTarget.value as RecurrencePresetKind;
          if (next === "custom") {
            onChange(value ?? specForPreset("daily", start));
          } else {
            onChange(specForPreset(next, start));
          }
        }}
      >
        {presets.map((kind) => (
          <option key={kind} value={kind}>{presetLabel(kind, start)}</option>
        ))}
      </select>

      {preset === "custom" ? (value ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="number"
              aria-label="間隔"
              min={1}
              max={99}
              value={value.interval}
              onChange={(e) => onChange({ ...value, interval: Math.max(1, Math.min(99, Number(e.currentTarget.value) || 1)) })}
              className="min-h-12 w-20 rounded-2xl bg-bg-muted px-3 text-sm font-bold"
            />
            <select
              aria-label="単位"
              className="min-h-12 flex-1 rounded-2xl bg-bg-muted px-4 text-sm font-bold"
              value={value.freq}
              onChange={(e) => {
                const freq = e.currentTarget.value as RecurrenceSpec["freq"];
                onChange({
                  ...value,
                  freq,
                  byDay: freq === "WEEKLY" ? (value.byDay.length === 0 ? [weekdayCodeOf(start)] : value.byDay) : value.byDay,
                  monthlyMode: freq === "MONTHLY" ? (value.monthlyMode ?? "BYMONTHDAY") : value.monthlyMode,
                });
              }}
            >
              <option value="DAILY">日</option>
              <option value="WEEKLY">週</option>
              <option value="MONTHLY">月</option>
              <option value="YEARLY">年</option>
            </select>
          </div>

          {value.freq === "WEEKLY" ? (
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_CODES.map((code, index) => {
                const selected = value.byDay.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-label={`曜日 ${WEEKDAY_LABELS[index]}`}
                    aria-pressed={selected}
                    onClick={() => {
                      const next = selected ? value.byDay.filter((day) => day !== code) : [...value.byDay, code];
                      onChange({ ...value, byDay: sortWeekdays(next.length > 0 ? next : [weekdayCodeOf(start)]) });
                    }}
                    className={`h-11 w-11 rounded-2xl text-sm font-bold ${selected ? "bg-accent-500 text-white" : "bg-bg-muted"}`}
                  >
                    {WEEKDAY_LABELS[index]}
                  </button>
                );
              })}
            </div>
          ) : null}

          {value.freq === "MONTHLY" ? (
            <select
              aria-label="月の繰り返し方"
              className="min-h-12 w-full rounded-2xl bg-bg-muted px-4 text-sm font-bold"
              value={value.monthlyMode ?? "BYMONTHDAY"}
              onChange={(e) => onChange({ ...value, monthlyMode: e.currentTarget.value as "BYMONTHDAY" | "BYDAY" })}
            >
              <option value="BYMONTHDAY">{`毎月 ${start.getDate()}日`}</option>
              <option value="BYDAY">毎月 第N曜</option>
            </select>
          ) : null}

          <select
            aria-label="終了"
            className="min-h-12 w-full rounded-2xl bg-bg-muted px-4 text-sm font-bold"
            value={value.end.kind}
            onChange={(e) => {
              const kind = e.currentTarget.value;
              if (kind === "until") onChange({ ...value, end: { kind: "until", date: toDateInput(start) } });
              else if (kind === "count") onChange({ ...value, end: { kind: "count", count: 10 } });
              else onChange({ ...value, end: { kind: "never" } });
            }}
          >
            <option value="never">なし</option>
            <option value="until">日付</option>
            <option value="count">回数</option>
          </select>

          {value.end.kind === "until" ? (
            <input
              type="date"
              aria-label="終了日"
              min={toDateInput(start)}
              value={value.end.date}
              onChange={(e) => onChange({ ...value, end: { kind: "until", date: e.currentTarget.value } })}
              className="min-h-12 w-full rounded-2xl bg-bg-muted px-4 text-sm font-bold"
            />
          ) : null}
          {value.end.kind === "count" ? (
            <input
              type="number"
              aria-label="回数"
              min={1}
              max={730}
              value={value.end.count}
              onChange={(e) => onChange({ ...value, end: { kind: "count", count: Math.max(1, Math.min(730, Number(e.currentTarget.value) || 1)) } })}
              className="min-h-12 w-full rounded-2xl bg-bg-muted px-4 text-sm font-bold"
            />
          ) : null}
        </div>
      ) : null) : null}

      <p className="mt-2 text-xs text-fg-secondary">{describeSpec(value, start)}</p>
    </Field>
  );
}
