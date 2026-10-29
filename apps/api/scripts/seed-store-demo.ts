/** ストア撮影用のユーザー・時間割・出欠・公開時間割を作成する。 */
import { pathToFileURL } from "node:url";
import dayjs from "dayjs";
import { prisma } from "../src/db";
import { generateOccurrencesForUserTimetable } from "../src/services/occurrenceGen";

const MINATO_ID = "store-demo-user";
const YUI_ID = "store-demo-yui";
const HARUTO_ID = "store-demo-haruto";
const BEARER_TOKEN = "store-demo-bearer-token-0001";
const DAYS_OF_WEEK = "1,2,3,4,5";

export type StoreDemoSeedResult = {
  userId: "store-demo-user";
  bearerToken: "store-demo-bearer-token-0001";
  semesterId: string;
  semesterName: string;
  roomId: string;
  templateIds: [string, string]; // Aクラス、Bクラスの順
  today: string; // プロセスのタイムゾーンでの YYYY-MM-DD
};

type CourseDefinition = {
  name: string;
  color: string;
  teacher?: string;
  maxAbsences?: number;
  tardiesPerAbsence?: number | null;
  absentLessons?: number[];
  tardyLessons?: number[];
  meetings: {
    dayOfWeek: number;
    startPeriodIndex: number;
    periodCount: number;
    room?: string;
  }[];
};

const SLOTS = [
  { periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 },
  { periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730 },
  { periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870 },
  { periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970 },
];

const MINATO_COURSES: CourseDefinition[] = [
  {
    name: "Java演習", color: "#568CFC", teacher: "小林先生",
    maxAbsences: 5, tardiesPerAbsence: 3, absentLessons: [1], tardyLessons: [2, 4],
    meetings: [
      { dayOfWeek: 1, startPeriodIndex: 1, periodCount: 2, room: "PC1" },
      { dayOfWeek: 4, startPeriodIndex: 1, periodCount: 1, room: "PC1" },
    ],
  },
  {
    name: "データベース", color: "#A978FA", teacher: "田中先生",
    maxAbsences: 4, tardiesPerAbsence: null, absentLessons: [1, 3, 5],
    meetings: [
      { dayOfWeek: 2, startPeriodIndex: 3, periodCount: 1, room: "PC2" },
      { dayOfWeek: 5, startPeriodIndex: 3, periodCount: 1, room: "PC2" },
    ],
  },
  {
    name: "ネットワーク", color: "#56D8C3", teacher: "森先生",
    maxAbsences: 4, tardiesPerAbsence: null,
    meetings: [
      { dayOfWeek: 1, startPeriodIndex: 3, periodCount: 1, room: "305" },
      { dayOfWeek: 3, startPeriodIndex: 2, periodCount: 1, room: "305" },
    ],
  },
  {
    name: "Webデザイン", color: "#FC6ABF", teacher: "石井先生",
    maxAbsences: 3, tardiesPerAbsence: 3, absentLessons: [1], tardyLessons: [2, 4],
    meetings: [{ dayOfWeek: 2, startPeriodIndex: 1, periodCount: 2, room: "PC3" }],
  },
  {
    name: "セキュリティ", color: "#12B172", teacher: "岡田先生",
    maxAbsences: 4, tardiesPerAbsence: null, absentLessons: [1, 3],
    meetings: [
      { dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1, room: "301" },
      { dayOfWeek: 5, startPeriodIndex: 2, periodCount: 1, room: "301" },
    ],
  },
  {
    name: "ビジネス英語", color: "#FD728E", teacher: "上田先生",
    maxAbsences: 4, tardiesPerAbsence: null,
    meetings: [{ dayOfWeek: 4, startPeriodIndex: 2, periodCount: 1, room: "201" }],
  },
  {
    name: "卒業制作", color: "#56D8C3", teacher: "西村先生",
    maxAbsences: 3, tardiesPerAbsence: null,
    meetings: [{ dayOfWeek: 4, startPeriodIndex: 3, periodCount: 2, room: "PC1" }],
  },
  {
    name: "キャリア講座", color: "#A978FA", teacher: "西村先生",
    maxAbsences: 3, tardiesPerAbsence: null,
    meetings: [{ dayOfWeek: 5, startPeriodIndex: 1, periodCount: 1, room: "大教室" }],
  },
];

const YUI_COURSES: CourseDefinition[] = [
  { name: "Java演習", color: "#568CFC", meetings: [
    { dayOfWeek: 1, startPeriodIndex: 1, periodCount: 2 },
    { dayOfWeek: 4, startPeriodIndex: 1, periodCount: 1 },
  ] },
  { name: "データベース", color: "#A978FA", meetings: [
    { dayOfWeek: 2, startPeriodIndex: 3, periodCount: 1 },
    { dayOfWeek: 5, startPeriodIndex: 3, periodCount: 1 },
  ] },
  { name: "CGデザイン", color: "#FC6ABF", meetings: [
    { dayOfWeek: 3, startPeriodIndex: 2, periodCount: 1 },
  ] },
];

const HARUTO_COURSES: CourseDefinition[] = [
  { name: "ネットワーク", color: "#56D8C3", meetings: [
    { dayOfWeek: 1, startPeriodIndex: 3, periodCount: 1 },
  ] },
  { name: "セキュリティ", color: "#12B172", meetings: [
    { dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 },
  ] },
  { name: "卒業制作", color: "#56D8C3", meetings: [
    { dayOfWeek: 4, startPeriodIndex: 3, periodCount: 2 },
  ] },
  { name: "キャリア講座", color: "#A978FA", meetings: [
    { dayOfWeek: 5, startPeriodIndex: 1, periodCount: 1 },
  ] },
];

export async function seedStoreDemo(opts?: { now?: Date }): Promise<StoreDemoSeedResult> {
  const now = opts?.now ?? new Date();
  const today = dayjs(now).startOf("day");

  // 掃除を含め、DB に触れる前に実行条件を確認する。
  if (process.env.NODE_ENV === "production") {
    throw new Error("STORE_DEMO_REFUSED_PRODUCTION");
  }
  if (!process.env.DATABASE_URL?.startsWith("file:")) {
    throw new Error("STORE_DEMO_REQUIRES_SQLITE_FILE_DB");
  }
  if (today.day() === 0 || today.day() === 6) {
    throw new Error("STORE_DEMO_WEEKEND");
  }

  // 著者削除でテンプレートが残らないよう先に削除し、配下は cascade で掃除する。
  await prisma.timetableTemplate.deleteMany({ where: { authorUserId: { in: [YUI_ID, HARUTO_ID] } } });
  await prisma.user.deleteMany({ where: { id: { in: [MINATO_ID, YUI_ID, HARUTO_ID] } } });

  // 学校・学科は再実行でも再利用する。
  const existingSchool = await prisma.school.findFirst({ where: { name: "生わさび専門学校", mextCode: null } });
  const school = existingSchool ?? await prisma.school.create({
    data: { name: "生わさび専門学校", kind: "VOCATIONAL_SCHOOL" },
  });
  const department = await prisma.department.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "情報処理科" } },
    update: {},
    create: { schoolId: school.id, name: "情報処理科" },
  });

  const month = today.month() + 1;
  const term = month >= 4 && month <= 9 ? "前期" : "後期";
  const year = month <= 3 ? today.year() - 1 : today.year();
  const semesterName = `${year} ${term}`;
  const startDate = today.subtract(49, "day").toDate();
  const endDate = today.add(77, "day").endOf("day").toDate();

  async function createUserTimetable(
    profile: { id: string; name: string; handle: string; email: string; requiredAttendanceRate?: number },
    definitions: CourseDefinition[],
  ) {
    const user = await prisma.user.create({
      data: { ...profile, emailVerified: true, schoolId: school.id, departmentId: department.id },
    });
    const semester = await prisma.semester.create({
      data: { userId: user.id, name: semesterName, startDate, endDate },
    });
    await prisma.user.update({ where: { id: user.id }, data: { defaultSemesterId: semester.id } });
    const timetable = await prisma.userTimetable.create({
      data: { userId: user.id, semesterId: semester.id, title: `${semesterName} 時間割`, daysOfWeek: DAYS_OF_WEEK },
    });
    for (const slot of SLOTS) {
      await prisma.daySlot.create({ data: { userTimetableId: timetable.id, ...slot } });
    }

    const courses = [] as { id: string; definition: CourseDefinition }[];
    for (const definition of definitions) {
      const course = await prisma.course.create({
        data: {
          userTimetableId: timetable.id, name: definition.name,
          teacher: definition.teacher ?? null, color: definition.color,
          requiredAttendanceRate: null, maxAbsences: definition.maxAbsences ?? null,
          tardiesPerAbsence: definition.tardiesPerAbsence ?? null,
        },
      });
      courses.push({ id: course.id, definition });
      for (const meeting of definition.meetings) {
        await prisma.meeting.create({ data: { userTimetableId: timetable.id, courseId: course.id, ...meeting } });
      }
    }
    await generateOccurrencesForUserTimetable({ userTimetableId: timetable.id });
    return { semester, courses };
  }

  const minato = await createUserTimetable({
    id: MINATO_ID, name: "みなと", handle: "minato", email: "store-demo@atender.local", requiredAttendanceRate: 80,
  }, MINATO_COURSES);
  await createUserTimetable({
    id: YUI_ID, name: "ゆい", handle: "yui", email: "store-demo-yui@atender.local",
  }, YUI_COURSES);
  await createUserTimetable({
    id: HARUTO_ID, name: "はると", handle: "haruto", email: "store-demo-haruto@atender.local",
  }, HARUTO_COURSES);

  // 科目ごとに日付で授業回を束ね、連続コマも全て同じ出欠にする。今日以降は記録しない。
  for (const { id: courseId, definition } of minato.courses) {
    const past = await prisma.meetingOccurrence.findMany({
      where: { courseId, date: { lt: today.toDate() } },
      orderBy: { date: "asc" },
    });
    const lessonIndices = new Map<string, number>();
    for (const occurrence of past) {
      const date = dayjs(occurrence.date).format("YYYY-MM-DD");
      if (!lessonIndices.has(date)) lessonIndices.set(date, lessonIndices.size);
      const index = lessonIndices.get(date)!;
      const status = definition.absentLessons?.includes(index) ? "ABSENT"
        : definition.tardyLessons?.includes(index) ? "TARDY" : "PRESENT";
      await prisma.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: MINATO_ID, status } });
    }
  }

  for (const receiverId of [YUI_ID, HARUTO_ID]) {
    await prisma.friendship.create({ data: { senderId: MINATO_ID, receiverId, status: "ACCEPTED", acceptedAt: now } });
  }
  await prisma.session.create({
    data: { id: "store-demo-session", userId: MINATO_ID, token: BEARER_TOKEN, expiresAt: dayjs(now).add(365, "day").toDate() },
  });

  const room = await prisma.room.create({
    data: { name: "生わさび", description: "情報処理科 2年の仲間", createdByUserId: MINATO_ID, showMemberTimetables: true },
  });
  for (const userId of [MINATO_ID, YUI_ID, HARUTO_ID]) {
    await prisma.roomMembership.create({ data: { roomId: room.id, userId, role: userId === MINATO_ID ? "OWNER" : "MEMBER" } });
  }

  // 公開時間割は同じ定義から写し、Bクラスだけ火曜と木曜を入れ替える。
  async function createTemplate(className: string, authorUserId: string, copyCount: number, swapDays: boolean) {
    const template = await prisma.timetableTemplate.create({
      data: {
        authorUserId, schoolId: school.id, departmentId: department.id,
        title: `情報処理科 2年 ${term} ${className}`, description: `${className}の${term}の時間割`,
        year: 2, term, isPublic: true, copyCount, daysOfWeek: DAYS_OF_WEEK,
      },
    });
    for (const slot of SLOTS) {
      await prisma.templateDaySlot.create({ data: { templateId: template.id, ...slot } });
    }
    for (const definition of MINATO_COURSES) {
      const course = await prisma.templateCourse.create({
        data: { templateId: template.id, name: definition.name, teacher: definition.teacher, color: definition.color },
      });
      for (const meeting of definition.meetings) {
        const dayOfWeek = swapDays && meeting.dayOfWeek === 2 ? 4
          : swapDays && meeting.dayOfWeek === 4 ? 2 : meeting.dayOfWeek;
        await prisma.templateMeeting.create({
          data: { templateId: template.id, courseId: course.id, ...meeting, dayOfWeek },
        });
      }
    }
    return template.id;
  }
  const templateAId = await createTemplate("Aクラス", YUI_ID, 18, false);
  const templateBId = await createTemplate("Bクラス", HARUTO_ID, 9, true);

  return {
    userId: MINATO_ID, bearerToken: BEARER_TOKEN, semesterId: minato.semester.id,
    semesterName, roomId: room.id, templateIds: [templateAId, templateBId],
    today: today.format("YYYY-MM-DD"),
  };
}

async function main() {
  console.log(JSON.stringify(await seedStoreDemo(), null, 2));
}

// インポート時は実行せず、直接実行した場合だけ結果と終了コードを返す。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(error instanceof Error && error.message === "STORE_DEMO_WEEKEND" ? 2 : 1);
  });
}
