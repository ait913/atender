import { prisma } from "../db";

export async function findActiveUserTimetable(userId: string, semesterId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { defaultSemesterId: true } });
  return prisma.userTimetable.findFirst({
    where: {
      userId,
      semesterId: semesterId ?? user?.defaultSemesterId ?? undefined,
    },
    orderBy: { createdAt: "desc" },
    include: { daySlots: true, courses: true, meetings: true },
  });
}

export async function inferUserSchoolDepartment(userId: string) {
  const timetable = await prisma.userTimetable.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      sourceTemplate: { select: { schoolId: true, departmentId: true } },
    },
  });
  return {
    schoolId: timetable?.sourceTemplate?.schoolId ?? null,
    departmentId: timetable?.sourceTemplate?.departmentId ?? null,
  };
}
