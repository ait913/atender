const DAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function presetToRRule(preset: string, start: Date): string | null {
  const day = DAY_CODES[start.getUTCDay()];
  switch (preset) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${day}`;
    case "weekday":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "monthly_bymonthday":
      return `FREQ=MONTHLY;BYMONTHDAY=${start.getUTCDate()}`;
    case "monthly_byday":
      return `FREQ=MONTHLY;BYDAY=${weekOrdinalOf(start)}${day}`;
    case "yearly":
      return `FREQ=YEARLY;BYMONTH=${start.getUTCMonth() + 1};BYMONTHDAY=${start.getUTCDate()}`;
    default:
      return null;
  }
}

export function recurrenceToText(rrule: string | null | undefined, start?: Date) {
  if (!rrule) return "繰り返しなし";
  const parts = new Map(rrule.split(";").map((part) => {
    const [key, value = ""] = part.split("=");
    return [key, value] as const;
  }));
  const freq = parts.get("FREQ");
  const byDay = parts.get("BYDAY");
  const byMonthDay = parts.get("BYMONTHDAY");
  if (freq === "DAILY") return "毎日";
  if (freq === "WEEKLY" && byDay === "MO,TU,WE,TH,FR") return "平日のみ";
  if (freq === "WEEKLY" && byDay) return `毎週 ${byDay.split(",").map(dayCodeToJa).join(", ")}`;
  if (freq === "MONTHLY" && byMonthDay) return `毎月 ${byMonthDay}日`;
  if (freq === "MONTHLY" && byDay) return `毎月 ${formatOrdinalDay(byDay)}`;
  if (freq === "YEARLY" && parts.get("BYMONTH") && byMonthDay) return `毎年 ${parts.get("BYMONTH")}月${byMonthDay}日`;
  return start ? `繰り返し (${start.toLocaleDateString("ja-JP")})` : "繰り返し";
}

function weekOrdinalOf(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

function dayCodeToJa(code: string) {
  const index = DAY_CODES.findIndex((value) => value === code.replace(/^-?\d+/, ""));
  return index >= 0 ? DAYS[index] : code;
}

function formatOrdinalDay(value: string) {
  const match = value.match(/^(-?\d+)([A-Z]{2})$/);
  if (!match) return value;
  const [, ordinal, day] = match;
  const label = ordinal === "-1" ? "最終" : `第${ordinal}`;
  return `${label}${dayCodeToJa(day)}曜`;
}
