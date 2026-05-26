import { prisma } from "../db";
import { AppError } from "../lib/appError";

export async function assertNoPeriodConflict(args: {
  userTimetableId: string;
  dayOfWeek: number;
  startPeriodIndex: number;
  periodCount: number;
  excludeMeetingId?: string;
}) {
  const nextStart = args.startPeriodIndex;
  const nextEnd = args.startPeriodIndex + args.periodCount;
  const meetings = await prisma.meeting.findMany({
    where: {
      userTimetableId: args.userTimetableId,
      dayOfWeek: args.dayOfWeek,
      id: args.excludeMeetingId ? { not: args.excludeMeetingId } : undefined,
    },
    select: { startPeriodIndex: true, periodCount: true },
  });
  const hasConflict = meetings.some((meeting) => {
    const existingStart = meeting.startPeriodIndex;
    const existingEnd = meeting.startPeriodIndex + meeting.periodCount;
    return existingStart < nextEnd && existingEnd > nextStart;
  });
  if (hasConflict) {
    throw new AppError(409, "CONFLICT", "Period conflict", { reason: "PERIOD_CONFLICT" });
  }
}
