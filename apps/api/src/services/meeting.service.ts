import type { MeetingBulkCreateInput, MeetingUpdateInput } from "@atender/shared";
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
          room: input.room ?? null,
        },
      });
      await generateOccurrencesForMeeting(tx, meeting);
      created.push(meeting);
    }
    return created;
  });
  return meetings.map(meetingDto);
}

function hasPeriodConflict(
  meetings: Array<{ id: string; dayOfWeek: number; startPeriodIndex: number; periodCount: number }>,
  target: { id: string; dayOfWeek: number; startPeriodIndex: number; periodCount: number },
) {
  const targetPeriods = new Set(Array.from({ length: target.periodCount }, (_, index) => target.startPeriodIndex + index));
  for (const meeting of meetings) {
    if (meeting.id === target.id || meeting.dayOfWeek !== target.dayOfWeek) continue;
    for (let offset = 0; offset < meeting.periodCount; offset += 1) {
      const conflictPeriod = meeting.startPeriodIndex + offset;
      if (targetPeriods.has(conflictPeriod)) return conflictPeriod;
    }
  }
  return null;
}

export async function updateMeeting(userId: string, meetingId: string, input: MeetingUpdateInput) {
  const current = await prisma.meeting.findFirst({
    where: { id: meetingId, userTimetable: { userId } },
    include: { userTimetable: { include: { meetings: true } } },
  });
  if (!current) throw new AppError(404, "NOT_FOUND", "Meeting not found");

  const next = {
    id: current.id,
    dayOfWeek: input.dayOfWeek ?? current.dayOfWeek,
    startPeriodIndex: input.startPeriodIndex ?? current.startPeriodIndex,
    periodCount: input.periodCount ?? current.periodCount,
  };
  const scheduleChanged =
    next.dayOfWeek !== current.dayOfWeek ||
    next.startPeriodIndex !== current.startPeriodIndex ||
    next.periodCount !== current.periodCount;

  if (scheduleChanged) {
    const conflictPeriod = hasPeriodConflict(current.userTimetable.meetings, next);
    if (conflictPeriod != null) {
      throw new AppError(409, "PERIOD_CONFLICT", "Period is already occupied", { conflictPeriod });
    }
  }

  const data = {
    ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
    ...(input.startPeriodIndex !== undefined ? { startPeriodIndex: input.startPeriodIndex } : {}),
    ...(input.periodCount !== undefined ? { periodCount: input.periodCount } : {}),
    ...(input.room !== undefined ? { room: input.room } : {}),
  };

  if (!scheduleChanged) {
    const updated = await prisma.meeting.update({ where: { id: meetingId }, data });
    return meetingDto(updated);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.meetingOccurrence.deleteMany({ where: { meetingId } });
    const meeting = await tx.meeting.update({ where: { id: meetingId }, data });
    await generateOccurrencesForMeeting(tx, meeting);
    return meeting;
  });
  return meetingDto(updated);
}

export async function deleteMeeting(userId: string, meetingId: string) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, userTimetable: { userId } },
  });
  if (!meeting) throw new AppError(404, "NOT_FOUND", "Meeting not found");
  await prisma.meeting.delete({ where: { id: meetingId } });
}
