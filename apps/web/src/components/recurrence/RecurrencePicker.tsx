import { Select } from "@/components/ui/Input";
import { recurrenceToText, presetToRRule } from "@/lib/recurrenceFormat";

export type RecurrenceValue = { rrule: string | null };

export function RecurrencePicker({ value, onChange, start }: {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  start: Date;
}) {
  const dayLabel = ["日", "月", "火", "水", "木", "金", "土"][start.getUTCDay()];
  const preset = currentPreset(value.rrule, start);
  return (
    <div className="space-y-2">
      <label className="block space-y-2">
        <span className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">繰り返し</span>
        <Select
          value={preset}
          onChange={(event) => onChange({ rrule: presetToRRule(event.currentTarget.value, start) })}
          aria-label="繰り返し"
        >
          <option value="none">なし</option>
          <option value="daily">毎日</option>
          <option value="weekly">毎週 ({dayLabel})</option>
          <option value="weekday">平日のみ</option>
          <option value="monthly_bymonthday">毎月 {start.getUTCDate()}日</option>
          <option value="monthly_byday">毎月 第{Math.floor((start.getUTCDate() - 1) / 7) + 1}{dayLabel}曜</option>
          <option value="yearly">毎年 {start.getUTCMonth() + 1}月{start.getUTCDate()}日</option>
        </Select>
      </label>
      {value.rrule ? <p className="text-xs font-semibold text-fg-secondary">{recurrenceToText(value.rrule, start)}</p> : null}
    </div>
  );
}

function currentPreset(rrule: string | null, start: Date) {
  if (!rrule) return "none";
  for (const preset of ["daily", "weekly", "weekday", "monthly_bymonthday", "monthly_byday", "yearly"]) {
    if (presetToRRule(preset, start) === rrule) return preset;
  }
  return "none";
}
