import type { MeetingBulkCreateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { meetingDto } from "../lib/dto";
import { generateOccurrencesForMeeting } from "./occurrenceGen";

export function periodsToMeetings(periods: number[]) {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  const groups: Array<{ startPeriodIndex: number; periodCount: number }> = [];
  for (const period of sorted) {
    const last = groups.at(-1);
    if (last && last.startPeriodIndex + last.periodCount === period) last.periodCount += 1;
    else groups.push({ startPeriodIndex: period, periodCount: 1 });
  }
  return groups;
}

export async function createMeetingsBulk(userId: string, input: MeetingBulkCreateInput) {
  const timetable = await prisma.userTimetable.findFirst({
    where: { id: input.userTimetableId, userId },
    include: { daySlots: true, meetings: true },
  });
  if (!timetable) throw new AppError(404, "NOT_FOUND", "UserTimetable not found");

  const groups = periodsToMeetings(input.startPeriodIndexes);
  const selectedPeriods = new Set(input.startPeriodIndexes);
  for (const meeting of timetable.meetings) {
    if (meeting.dayOfWeek !== input.dayOfWeek) continue;
    for (let offset = 0; offset < meeting.periodCount; offset += 1) {
      const conflictPeriod = meeting.startPeriodIndex + offset;
      if (selectedPeriods.has(conflictPeriod)) {
        throw new AppError(409, "PERIOD_CONFLICT", "Period is already occupied", { conflictPeriod });
      }
    }
  }

  const meetings = await prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({ where: { id: input.courseId, userTimetableId: input.userTimetableId } });
    if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");

    const created = [];
    for (const group of groups) {
      const meeting = await tx.meeting.create({
        data: {
          userTimetableId: input.userTimetableId,
          courseId: input.courseId,
          dayOfWeek: input.dayOfWeek,
          startPeriodIndex: group.startPeriodIndex,
          periodCount: group.periodCount,
        },
      });
      await generateOccurrencesForMeeting(tx, meeting);
      created.push(meeting);
    }
    return created;
  });
  return meetings.map(meetingDto);
}
