import type { SemesterDto } from "@atender/shared";
import { addDays, addMonths, formatYearMonthDay, monthFirst } from "./CalendarDate";

export type SemesterProposal = { name: string; startDate: string; endDate: string };
export const DISMISSED_KEY = "atender.semesterRollover.dismissedSemesterId";

export function initialProposal(today: string): SemesterProposal {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month >= 4 && month <= 9) {
    return { name: `${year} 前期`, startDate: `${year}-04-01`, endDate: `${year}-09-30` };
  }
  const startYear = month <= 3 ? year - 1 : year;
  return { name: `${startYear} 後期`, startDate: `${startYear}-10-01`, endDate: `${startYear + 1}-03-31` };
}

export function latest(semesters: SemesterDto[]): SemesterDto | null {
  return [...semesters].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate > b.startDate ? -1 : 1;
    if (a.endDate !== b.endDate) return a.endDate > b.endDate ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0] ?? null;
}

export function allEnded(semesters: SemesterDto[], today: string): boolean {
  return semesters.length > 0 && semesters.every((semester) => semester.endDate < today);
}

export function promptTarget(semesters: SemesterDto[], today: string, dismissedSemesterId: string | null): SemesterDto | null {
  if (!allEnded(semesters, today)) return null;
  const target = latest(semesters);
  return target?.id !== dismissedSemesterId ? target : null;
}

export function proposal(previous: SemesterDto, today: string): SemesterProposal {
  let startDate = addDays(previous.endDate, 1);
  let endDate = addDays(addMonths(startDate, 6), -1);
  if (endDate < today) {
    startDate = monthFirst(today);
    endDate = addDays(addMonths(startDate, 6), -1);
  }
  const month = Number(startDate.slice(5, 7));
  return { name: `${Number(startDate.slice(0, 4))} ${month >= 4 && month <= 9 ? "前期" : "後期"}`, startDate, endDate };
}

export function alertMessage(previous: SemesterDto): string {
  return `「${previous.name}」は ${formatYearMonthDay(previous.endDate)} に終了しました。新しい学期を作成しますか?`;
}

export function canCreate(name: string, startDate: string, endDate: string): boolean {
  return name.trim() !== "" && startDate <= endDate;
}

export function readDismissed(): string | null {
  return localStorage.getItem(DISMISSED_KEY);
}

export function writeDismissed(id: string | null): void {
  if (id == null) localStorage.removeItem(DISMISSED_KEY);
  else localStorage.setItem(DISMISSED_KEY, id);
}
