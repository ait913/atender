export function getTodayDayOfWeek(date: Date = new Date()): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 1;
  return day;
}
