import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const APP_TZ = "Asia/Tokyo";

export function today(now: Date = new Date()): { isoDate: string; startOfDay: Date; endOfDay: Date } {
  const d = dayjs(now).tz(APP_TZ);
  const start = d.startOf("day");
  const end = d.endOf("day");
  return {
    isoDate: start.format("YYYY-MM-DD"),
    startOfDay: start.toDate(),
    endOfDay: end.toDate(),
  };
}

export function dateStringToJstDay(date: string): { isoDate: string; startOfDay: Date; endOfDay: Date } {
  const start = dayjs.tz(date, "YYYY-MM-DD", APP_TZ).startOf("day");
  return {
    isoDate: start.format("YYYY-MM-DD"),
    startOfDay: start.toDate(),
    endOfDay: start.endOf("day").toDate(),
  };
}

export function toIsoDate(date: Date): string {
  return dayjs(date).tz(APP_TZ).format("YYYY-MM-DD");
}

export function semesterDateStart(date: string): Date {
  return dayjs.tz(date, "YYYY-MM-DD", APP_TZ).startOf("day").toDate();
}

export function semesterDateEnd(date: string): Date {
  return dayjs.tz(date, "YYYY-MM-DD", APP_TZ).endOf("day").toDate();
}
