import type { DaySlotDto, SemesterDto, UserTimetableDto } from "@atender/shared";
import { latest } from "./SemesterRollover";

export const DEFAULT_DAYS_OF_WEEK = [1, 2, 3, 4, 5];

export function previousTimetable(target: SemesterDto, semesters: SemesterDto[], timetables: UserTimetableDto[]): UserTimetableDto | null {
  const previous = latest(semesters.filter((semester) =>
    semester.startDate < target.startDate && timetables.some((timetable) => timetable.semesterId === semester.id),
  ));
  return timetables.find((timetable) => timetable.semesterId === previous?.id) ?? null;
}

export function inheritedSlots(previous: UserTimetableDto | null, fallback: DaySlotDto[]): DaySlotDto[] {
  return previous && previous.daySlots.length > 0 ? previous.daySlots : fallback;
}

export function inheritedDaysOfWeek(previous: UserTimetableDto | null): number[] {
  return previous && previous.daysOfWeek.length > 0 ? previous.daysOfWeek : [...DEFAULT_DAYS_OF_WEEK];
}
