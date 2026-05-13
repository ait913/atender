import { describe, expect, it } from "vitest";
import { prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { generateOccurrencesForUserTimetable } from "../src/services/occurrenceGen";

describe("occurrence generation service", () => {
  it("[§8 #66] periodCount=2 across 14 matching weekdays generates 28 MeetingOccurrence rows", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.semester.update({
      where: { id: complete.semester.id },
      data: { startDate: new Date("2026-04-01T00:00:00.000Z"), endDate: new Date("2026-07-01T00:00:00.000Z") },
    });

    const result = await generateOccurrencesForUserTimetable({ userTimetableId: complete.userTimetable.id });

    expect(result.created).toBe(28);
    await expect(db.meetingOccurrence.count({ where: { meetingId: complete.meeting.id } })).resolves.toBe(28);
  });

  it("[§8 #67] startPeriodIndex=1 periodCount=3 snapshots DaySlot periodIndex 1, 2, 3", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meeting.update({ where: { id: complete.meeting.id }, data: { periodCount: 3 } });

    await generateOccurrencesForUserTimetable({
      userTimetableId: complete.userTimetable.id,
      fromDate: new Date("2026-05-13T00:00:00.000Z"),
      toDate: new Date("2026-05-13T00:00:00.000Z"),
    });
    const occurrences = await db.meetingOccurrence.findMany({ orderBy: { periodOffset: "asc" } });

    expect(occurrences.map(o => [o.periodOffset, o.startMinute, o.endMinute])).toEqual([
      [0, 540, 630],
      [1, 640, 730],
      [2, 780, 870],
    ]);
  });

  it("[§8 #68] missing DaySlot for a period returns VALIDATION_ERROR with DAY_SLOT_NOT_FOUND reason", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meeting.update({ where: { id: complete.meeting.id }, data: { startPeriodIndex: 5, periodCount: 1 } });

    await expect(generateOccurrencesForUserTimetable({
      userTimetableId: complete.userTimetable.id,
      fromDate: new Date("2026-05-13T00:00:00.000Z"),
      toDate: new Date("2026-05-13T00:00:00.000Z"),
    })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      details: { reason: "DAY_SLOT_NOT_FOUND" },
    });
  });

  it("[§8 #69] duplicate (meetingId, date, periodOffset) rows are skipped", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const first = await generateOccurrencesForUserTimetable({
      userTimetableId: complete.userTimetable.id,
      fromDate: new Date("2026-05-13T00:00:00.000Z"),
      toDate: new Date("2026-05-13T00:00:00.000Z"),
    });
    const second = await generateOccurrencesForUserTimetable({
      userTimetableId: complete.userTimetable.id,
      fromDate: new Date("2026-05-13T00:00:00.000Z"),
      toDate: new Date("2026-05-13T00:00:00.000Z"),
    });

    expect(first.created).toBe(2);
    expect(second.skipped).toBe(2);
    await expect(db.meetingOccurrence.count()).resolves.toBe(2);
  });
});
