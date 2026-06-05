import { Prisma } from "@prisma/client";
import type { CourseSuspensionCreateInput, CourseSuspensionDto } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";

export function suspensionDto(suspension: {
  id: string;
  courseId: string;
  date: Date;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CourseSuspensionDto {
  return {
    id: suspension.id,
    courseId: suspension.courseId,
    date: toIsoDate(suspension.date),
    reason: suspension.reason,
    createdAt: suspension.createdAt.toISOString(),
    updatedAt: suspension.updatedAt.toISOString(),
  };
}

async function assertOwnCourse(courseId: string, userId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, userTimetable: { userId } },
    select: { id: true },
  });
  if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
}

export async function listCourseSuspensions(args: { courseId: string; userId: string }): Promise<CourseSuspensionDto[]> {
  await assertOwnCourse(args.courseId, args.userId);
  const suspensions = await prisma.courseSuspension.findMany({
    where: { courseId: args.courseId },
    orderBy: { date: "asc" },
  });
  return suspensions.map(suspensionDto);
}

export async function createCourseSuspension(args: {
  courseId: string;
  userId: string;
  input: CourseSuspensionCreateInput;
}): Promise<CourseSuspensionDto> {
  await assertOwnCourse(args.courseId, args.userId);
  const { startOfDay } = dateStringToJstDay(args.input.date);
  try {
    const suspension = await prisma.courseSuspension.create({
      data: {
        courseId: args.courseId,
        date: startOfDay,
        reason: args.input.reason?.trim() || null,
      },
    });
    return suspensionDto(suspension);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "DUPLICATE", "Suspension already exists for this date");
    }
    throw error;
  }
}

export async function deleteCourseSuspension(args: {
  courseId: string;
  suspensionId: string;
  userId: string;
}): Promise<void> {
  await assertOwnCourse(args.courseId, args.userId);
  const existing = await prisma.courseSuspension.findFirst({
    where: { id: args.suspensionId, courseId: args.courseId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Suspension not found");
  await prisma.courseSuspension.delete({ where: { id: args.suspensionId } });
}
