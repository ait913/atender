import type { UserTimetable } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";

function deriveDaysOfWeek(meetings: { dayOfWeek: number }[]): string {
  return [...new Set([1, 2, 3, 4, 5, ...meetings.map((meeting) => meeting.dayOfWeek === 0 ? 7 : meeting.dayOfWeek)])].sort((a, b) => a - b).join(",");
}

export async function copyTemplateToUser(args: {
  templateId: string;
  userId: string;
  semesterId: string;
  title?: string;
  replaceExisting?: boolean;
}): Promise<UserTimetable> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.userTimetable.findUnique({
        where: { userId_semesterId: { userId: args.userId, semesterId: args.semesterId } },
      });
      if (existing) {
        if (args.replaceExisting !== true) {
          throw new AppError(409, "CONFLICT", "UserTimetable already exists for semester");
        }
        await tx.userTimetable.delete({ where: { id: existing.id } });
      }

      const template = await tx.timetableTemplate.findFirst({
        where: { id: args.templateId, isPublic: true },
        include: { daySlots: true, courses: true, meetings: true },
      });
      if (!template) {
        throw new AppError(404, "NOT_FOUND", "Template not found");
      }

      const timetable = await tx.userTimetable.create({
        data: {
          userId: args.userId,
          semesterId: args.semesterId,
          title: args.title ?? template.title,
          sourceTemplateId: template.id,
          daysOfWeek: template.daysOfWeek ?? deriveDaysOfWeek(template.meetings),
        },
      });

      await tx.daySlot.createMany({
        data: template.daySlots.map((slot) => ({
          userTimetableId: timetable.id,
          periodIndex: slot.periodIndex,
          label: slot.label,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          isBreak: slot.isBreak,
        })),
      });

      const courseIdMap = new Map<string, string>();
      for (const course of template.courses) {
        const created = await tx.course.create({
          data: {
            userTimetableId: timetable.id,
            name: course.name,
            teacher: course.teacher,
            color: course.color,
            note: course.note,
          },
        });
        courseIdMap.set(course.id, created.id);
      }

      for (const meeting of template.meetings) {
        const courseId = courseIdMap.get(meeting.courseId);
        if (!courseId) {
          throw new AppError(400, "VALIDATION_ERROR", "Template meeting references missing course");
        }
        await tx.meeting.create({
          data: {
            userTimetableId: timetable.id,
            courseId,
            dayOfWeek: meeting.dayOfWeek,
            startPeriodIndex: meeting.startPeriodIndex,
            periodCount: meeting.periodCount,
            room: meeting.room,
          },
        });
      }

      await tx.timetableTemplate.update({
        where: { id: template.id },
        data: { copyCount: { increment: 1 } },
      });

      return timetable;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "CONFLICT", "UserTimetable already exists for semester");
    }
    throw error;
  }
}
