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

export async function resolveUserRuleScope(userId: string): Promise<{
  schoolId: string | null;
  departmentId: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { schoolId: true, departmentId: true },
  });
  return {
    schoolId: user?.schoolId ?? null,
    departmentId: user?.departmentId ?? null,
  };
}
