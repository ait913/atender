function jst(now: Date): Date {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

export function todayString(now: Date = new Date()): string {
  return jst(now).toISOString().slice(0, 10);
}

export function nowMinute(now: Date = new Date()): number {
  const date = jst(now);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function displayDay(now: Date = new Date()): number {
  return jst(now).getUTCDay() || 7;
}
