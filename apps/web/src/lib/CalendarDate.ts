export function addDays(date: string, n: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + n);
  return value.toISOString().slice(0, 10);
}

export function addMonths(date: string, n: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + n);
  const last = new Date(value);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  value.setUTCDate(Math.min(day, last.getUTCDate()));
  return value.toISOString().slice(0, 10);
}

export function monthFirst(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function mondayOf(date: string): string {
  return addDays(date, -((jsWeekday(date) + 6) % 7));
}

export function formatYearMonthDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年 ${month}月${day}日`;
}

export function formatMonthDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

export function jsWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
