import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient, SchoolKind } from "@prisma/client";

export async function createTestUser(
  prisma: PrismaClient,
  opts: {
    id?: string;
    email?: string;
    name?: string | null;
    schoolId?: string | null;
    departmentId?: string | null;
    defaultSemesterId?: string | null;
  } = {},
) {
  const id = opts.id ?? `user_${randomUUID()}`;
  return prisma.user.create({
    data: {
      id,
      email: opts.email ?? `${id}@example.test`,
      emailVerified: true,
      name: opts.name ?? "Test User",
      schoolId: opts.schoolId,
      departmentId: opts.departmentId,
      defaultSemesterId: opts.defaultSemesterId,
    },
  });
}

export async function createSessionCookie(prisma: PrismaClient, userId: string) {
  const token = `${randomBytes(24).toString("hex")}.${randomBytes(32).toString("hex")}`;
  await prisma.session.create({
    data: {
      id: `session_${randomUUID()}`,
      userId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    },
  });
  return `better-auth.session_token=${token}`;
}

export async function createSchoolDepartment(
  prisma: PrismaClient,
  opts: {
    schoolName?: string;
    departmentName?: string;
    kind?: SchoolKind;
    prefecture?: string | null;
  } = {},
) {
  const school = await prisma.school.create({
    data: {
      name: opts.schoolName ?? `学校 ${randomUUID()}`,
      nameKana: "テストガッコウ",
      kind: opts.kind ?? "UNIVERSITY",
      prefecture: opts.prefecture ?? "千葉県",
    },
  });
  const department = await prisma.department.create({
    data: {
      schoolId: school.id,
      name: opts.departmentName ?? "情報処理科",
      nameKana: "ジョウホウショリカ",
    },
  });
  return { school, department };
}

export async function createSemester(
  prisma: PrismaClient,
  userId: string,
  opts: { name?: string; startDate?: Date; endDate?: Date } = {},
) {
  return prisma.semester.create({
    data: {
      userId,
      name: opts.name ?? "2026 前期",
      startDate: opts.startDate ?? new Date("2026-04-01T00:00:00.000Z"),
      endDate: opts.endDate ?? new Date("2026-09-30T14:59:59.000Z"),
    },
  });
}

export async function createUserTimetable(
  prisma: PrismaClient,
  userId: string,
  semesterId: string,
  opts: { title?: string; sourceTemplateId?: string | null } = {},
) {
  const userTimetable = await prisma.userTimetable.create({
    data: {
      userId,
      semesterId,
      title: opts.title ?? "2026 前期 時間割",
      sourceTemplateId: opts.sourceTemplateId ?? null,
    },
  });

  await prisma.daySlot.createMany({
    data: [
      { userTimetableId: userTimetable.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 },
      { userTimetableId: userTimetable.id, periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730 },
      { userTimetableId: userTimetable.id, periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870 },
      { userTimetableId: userTimetable.id, periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970 },
      { userTimetableId: userTimetable.id, periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070 },
      { userTimetableId: userTimetable.id, periodIndex: 6, label: "6限", startMinute: 1080, endMinute: 1125 },
      { userTimetableId: userTimetable.id, periodIndex: 7, label: "7限", startMinute: 1130, endMinute: 1175 },
      { userTimetableId: userTimetable.id, periodIndex: 8, label: "8限", startMinute: 1180, endMinute: 1225 },
      { userTimetableId: userTimetable.id, periodIndex: 9, label: "9限", startMinute: 1230, endMinute: 1275 },
      { userTimetableId: userTimetable.id, periodIndex: 10, label: "10限", startMinute: 1280, endMinute: 1325 },
      { userTimetableId: userTimetable.id, periodIndex: 11, label: "11限", startMinute: 1330, endMinute: 1375 },
      { userTimetableId: userTimetable.id, periodIndex: 12, label: "12限", startMinute: 1380, endMinute: 1425 },
    ],
  });

  const course = await prisma.course.create({
    data: {
      userTimetableId: userTimetable.id,
      name: "オペレーティングシステム",
      teacher: "山田",
      color: "#ffffff",
      totalSessions: 15,
    },
  });

  const meeting = await prisma.meeting.create({
    data: {
      userTimetableId: userTimetable.id,
      courseId: course.id,
      dayOfWeek: 3,
      startPeriodIndex: 1,
      periodCount: 2,
      room: "305",
    },
  });

  return { userTimetable, course, meeting };
}

export async function setupCompleteUser(
  prisma: PrismaClient,
  opts: { email?: string; name?: string | null } = {},
) {
  const { school, department } = await createSchoolDepartment(prisma);
  const user = await createTestUser(prisma, {
    email: opts.email,
    name: opts.name,
    schoolId: school.id,
    departmentId: department.id,
  });
  const semester = await createSemester(prisma, user.id);
  const timetable = await createUserTimetable(prisma, user.id, semester.id);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { defaultSemesterId: semester.id },
  });
  const cookie = await createSessionCookie(prisma, user.id);

  return { user: updatedUser, school, department, semester, ...timetable, cookie };
}

export async function createOccurrence(
  prisma: PrismaClient,
  args: {
    meetingId: string;
    courseId: string;
    date?: Date;
    periodOffset?: number;
    startMinute?: number;
    endMinute?: number;
  },
) {
  return prisma.meetingOccurrence.create({
    data: {
      meetingId: args.meetingId,
      courseId: args.courseId,
      date: args.date ?? new Date("2026-05-13T00:00:00.000Z"),
      periodOffset: args.periodOffset ?? 0,
      startMinute: args.startMinute ?? 540,
      endMinute: args.endMinute ?? 630,
    },
  });
}
