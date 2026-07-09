/**
 * デモユーザー seed (ローカル simulator 検証用)。
 * user + school/dept + semester(today中央) + timetable + courses + meetings + occurrences + 一部attendance
 * を作り、bearer 用 Session を直挿しして token を出力する。
 *
 * 使い方: cd apps/api; pnpm exec tsx --env-file=.env scripts/seed-demo-user.ts
 */
import dayjs from "dayjs";
import { prisma } from "../src/db";
import { generateOccurrencesForUserTimetable } from "../src/services/occurrenceGen";

const DEMO_USER_ID = "demo-user-ios";
const DEMO_EMAIL = "demo@atender.local";
const DEMO_TOKEN = "demo-bearer-token-ios-resync-0001";

async function main() {
  // 既存デモを掃除 (冪等)
  await prisma.user.deleteMany({ where: { id: DEMO_USER_ID } });

  // school + department (seed 済の先頭を使う。無ければ作る)
  let school = await prisma.school.findFirst({ orderBy: { name: "asc" } });
  if (!school) {
    school = await prisma.school.create({ data: { name: "デモ専門学校", kind: "SENSHU" as any } });
  }
  let department = await prisma.department.findFirst({ where: { schoolId: school.id } });
  if (!department) {
    department = await prisma.department.create({ data: { schoolId: school.id, name: "情報処理科" } });
  }

  // semester: 今日を中央に置く (toDate 実績 vs 全期間射影が乖離する形)
  const start = dayjs().subtract(42, "day").startOf("day").toDate();
  const end = dayjs().add(42, "day").endOf("day").toDate();

  const user = await prisma.user.create({
    data: {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      emailVerified: true,
      name: "デモ太郎",
      schoolId: school.id,
      departmentId: department.id,
      requiredAttendanceRate: 80,
    },
  });

  const semester = await prisma.semester.create({
    data: { userId: user.id, name: "2026 前期", startDate: start, endDate: end },
  });
  await prisma.user.update({ where: { id: user.id }, data: { defaultSemesterId: semester.id } });

  const timetable = await prisma.userTimetable.create({
    data: { userId: user.id, semesterId: semester.id, title: "2026 前期 時間割", daysOfWeek: "1,2,3,4,5" },
  });

  // daySlots: 1-4限
  const slots = [
    { periodIndex: 1, label: "1限", startMinute: 9 * 60, endMinute: 10 * 60 + 30 },
    { periodIndex: 2, label: "2限", startMinute: 10 * 60 + 40, endMinute: 12 * 60 + 10 },
    { periodIndex: 3, label: "3限", startMinute: 13 * 60, endMinute: 14 * 60 + 30 },
    { periodIndex: 4, label: "4限", startMinute: 14 * 60 + 40, endMinute: 16 * 60 + 10 },
  ];
  for (const s of slots) {
    await prisma.daySlot.create({ data: { userTimetableId: timetable.id, ...s } });
  }

  // courses + meetings (曜日×限に配置。連続コマも1つ入れる)
  const courseDefs = [
    { name: "プログラミング演習", teacher: "村木先生", color: "#3B82F6", meetings: [{ dayOfWeek: 1, startPeriodIndex: 1, periodCount: 2 }, { dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 }] },
    { name: "データベース", teacher: "佐藤先生", color: "#10B981", meetings: [{ dayOfWeek: 2, startPeriodIndex: 3, periodCount: 1 }, { dayOfWeek: 4, startPeriodIndex: 3, periodCount: 1 }] },
    { name: "ネットワーク基礎", teacher: "鈴木先生", color: "#F59E0B", meetings: [{ dayOfWeek: 5, startPeriodIndex: 2, periodCount: 1 }] },
    { name: "英語", teacher: null, color: "#EF4444", meetings: [{ dayOfWeek: 1, startPeriodIndex: 4, periodCount: 1 }] },
  ];
  for (const cd of courseDefs) {
    const course = await prisma.course.create({
      data: { userTimetableId: timetable.id, name: cd.name, teacher: cd.teacher, color: cd.color },
    });
    for (const m of cd.meetings) {
      await prisma.meeting.create({
        data: { userTimetableId: timetable.id, courseId: course.id, dayOfWeek: m.dayOfWeek, startPeriodIndex: m.startPeriodIndex, periodCount: m.periodCount },
      });
    }
  }

  const gen = await generateOccurrencesForUserTimetable({ userTimetableId: timetable.id });

  // 過去 occurrence に attendance を付ける (8割出席, 一部欠席/公欠, 一部未記録)
  const todayStart = dayjs().startOf("day").toDate();
  const past = await prisma.meetingOccurrence.findMany({
    where: { meeting: { userTimetableId: timetable.id }, date: { lt: todayStart } },
    orderBy: { date: "asc" },
  });
  let i = 0;
  let recorded = 0;
  for (const occ of past) {
    i += 1;
    if (i % 7 === 0) continue; // 約14%は未記録で残す
    let status: any = "PRESENT";
    if (i % 11 === 0) status = "ABSENT";
    else if (i % 13 === 0) status = "EXCUSED";
    else if (i % 17 === 0) status = "TARDY";
    await prisma.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: user.id, status } });
    recorded += 1;
  }

  // 休講 (Phase C: 学期・科目 の日詳細/カレンダー検証用)
  const firstCourse = await prisma.course.findFirst({ where: { userTimetableId: timetable.id }, orderBy: { name: "asc" } });
  if (firstCourse) {
    await prisma.courseSuspension.create({
      data: { courseId: firstCourse.id, date: dayjs().subtract(7, "day").startOf("day").toDate(), reason: "教員都合" },
    });
  }
  await prisma.timetableSuspension.create({
    data: { userTimetableId: timetable.id, date: dayjs().subtract(14, "day").startOf("day").toDate(), reason: "創立記念日" },
  });

  // 個人予定 (PersonalCalendar 検証用)
  const evtBase = dayjs().startOf("day");
  await prisma.personalEvent.createMany({
    data: [
      { userId: user.id, semesterId: semester.id, date: evtBase.toDate(), title: "バイト", isAllDay: false, startMinute: 18 * 60, endMinute: 22 * 60, color: "#8B5CF6" },
      { userId: user.id, semesterId: semester.id, date: evtBase.add(1, "day").toDate(), title: "健康診断", isAllDay: true, color: "#10B981" },
      { userId: user.id, semesterId: semester.id, date: evtBase.add(3, "day").toDate(), title: "課題提出締切", isAllDay: true, color: "#EF4444" },
    ],
  });

  // 友達 (Phase D: Friends 検証用) — 2人 (承認済 + 受信中pending)
  await prisma.user.deleteMany({ where: { id: { in: ["demo-friend-1", "demo-friend-2"] } } });
  const friend1 = await prisma.user.create({
    data: { id: "demo-friend-1", email: "friend1@atender.local", emailVerified: true, name: "佐藤花子", handle: "hanako", schoolId: school.id, departmentId: department.id },
  });
  const friend2 = await prisma.user.create({
    data: { id: "demo-friend-2", email: "friend2@atender.local", emailVerified: true, name: "鈴木一郎", handle: "ichiro", schoolId: school.id, departmentId: department.id },
  });
  await prisma.friendship.create({ data: { senderId: user.id, receiverId: friend1.id, status: "ACCEPTED", acceptedAt: dayjs().toDate() } });
  await prisma.friendship.create({ data: { senderId: friend2.id, receiverId: user.id, status: "PENDING" } });

  // ルーム (Phase D: Rooms/RoomDetail 検証用) — demo + friend1 が所属、RoomEvent 1件
  const room = await prisma.room.create({
    data: { name: "情報処理科 2年A組", description: "みんなの予定共有", createdByUserId: user.id },
  });
  await prisma.roomMembership.create({ data: { roomId: room.id, userId: user.id, role: "OWNER" } });
  await prisma.roomMembership.create({ data: { roomId: room.id, userId: friend1.id, role: "MEMBER" } });
  await prisma.roomEvent.create({
    data: { roomId: room.id, authorId: user.id, title: "合同勉強会", start: dayjs().add(2, "day").hour(15).minute(0).toDate(), end: dayjs().add(2, "day").hour(17).minute(0).toDate(), color: "#C685FF" },
  });

  // 公開テンプレ (Phase D: Templates 検証用) — 最小 (daySlot/course/meeting 1件ずつ)
  const template = await prisma.timetableTemplate.create({
    data: { authorUserId: friend1.id, schoolId: school.id, departmentId: department.id, title: "2026 前期 情報処理科 2年", description: "标準時間割", year: 2, term: "前期", isPublic: true, copyCount: 3 },
  });
  const tSlot = await prisma.templateDaySlot.create({ data: { templateId: template.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 } });
  const tCourse = await prisma.templateCourse.create({ data: { templateId: template.id, name: "情報数学", teacher: "高橋先生", color: "#3B82F6" } });
  await prisma.templateMeeting.create({ data: { templateId: template.id, courseId: tCourse.id, dayOfWeek: 1, startPeriodIndex: tSlot.periodIndex, periodCount: 1 } });

  // bearer 用 session 直挿し
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.session.create({
    data: {
      id: "demo-session-ios",
      userId: user.id,
      token: DEMO_TOKEN,
      expiresAt: dayjs().add(365, "day").toDate(),
    },
  });

  console.log(JSON.stringify({
    userId: user.id, email: DEMO_EMAIL, semesterId: semester.id,
    occurrencesCreated: gen.created, pastOccurrences: past.length, attendanceRecorded: recorded,
    bearerToken: DEMO_TOKEN,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
