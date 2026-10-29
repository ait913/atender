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
const DEMO_ENDED_USER_ID = "demo-user-ios-ended";
const DEMO_ENDED_TOKEN = "demo-bearer-token-ios-ended-0002";
const DEMO_DELETE_USER_ID = "demo-user-ios-delete";
const DEMO_DELETE_TOKEN = "demo-bearer-token-ios-delete-0003";
const DEMO_CLASSMATE_USER_ID = "demo-user-ios-classmate";

async function main() {
  // 既存デモを掃除 (冪等)
  // 同級生の公開テンプレ (退会時に author が NULL になって残るので、先に消して重複させない)
  await prisma.timetableTemplate.deleteMany({ where: { authorUserId: DEMO_CLASSMATE_USER_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [DEMO_USER_ID, DEMO_ENDED_USER_ID, DEMO_DELETE_USER_ID, DEMO_CLASSMATE_USER_ID] } } });

  // school + department (seed 済の先頭を使う。無ければ作る)
  let school = await prisma.school.findFirst({ orderBy: { name: "asc" } });
  if (!school) {
    school = await prisma.school.create({ data: { name: "デモ専門学校", kind: "VOCATIONAL_SCHOOL" } });
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

  // 引継ぎ表示を確認するため、次学期は時間割未作成のままにする。
  const nextSemester = await prisma.semester.create({
    data: {
      userId: user.id,
      name: "次学期",
      startDate: dayjs().add(43, "day").startOf("day").toDate(),
      endDate: dayjs().add(227, "day").endOf("day").toDate(),
    },
  });

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
  for (const [courseIndex, cd] of courseDefs.entries()) {
    const course = await prisma.course.create({
      data: {
        userTimetableId: timetable.id,
        name: cd.name,
        teacher: cd.teacher,
        color: cd.color,
        // 先頭科目だけ出席基準 (欠席 4 回まで・遅刻 3 回で欠席 1 回)
        ...(courseIndex === 0 ? { maxAbsences: 4, tardiesPerAbsence: 3 } : {}),
      },
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

  // ルーム (Phase D: Rooms/RoomDetail 検証用) — demo + friend1 が所属
  const room = await prisma.room.create({
    data: { name: "情報処理科 2年A組", description: "みんなの予定共有", createdByUserId: user.id },
  });
  await prisma.roomMembership.create({ data: { roomId: room.id, userId: user.id, role: "OWNER" } });
  await prisma.roomMembership.create({ data: { roomId: room.id, userId: friend1.id, role: "MEMBER" } });

  // 公開テンプレ (Phase D: Templates 検証用) — 最小 (daySlot/course/meeting 1件ずつ)
  const template = await prisma.timetableTemplate.create({
    data: { authorUserId: friend1.id, schoolId: school.id, departmentId: department.id, title: "2026 前期 情報処理科 2年", description: "标準時間割", year: 2, term: "前期", isPublic: true, copyCount: 3 },
  });
  const tSlot = await prisma.templateDaySlot.create({ data: { templateId: template.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 } });
  const tCourse = await prisma.templateCourse.create({ data: { templateId: template.id, name: "情報数学", teacher: "高橋先生", color: "#3B82F6" } });
  await prisma.templateMeeting.create({ data: { templateId: template.id, courseId: tCourse.id, dayOfWeek: 1, startPeriodIndex: tSlot.periodIndex, periodCount: 1 } });

  // 同級生 + 公開テンプレ (レーン C: 学期管理・時間割の設定から取り込む対象。土曜と 2 コマ連続を含む)
  const classmate = await prisma.user.create({
    data: { id: DEMO_CLASSMATE_USER_ID, email: "classmate@atender.local", emailVerified: true, name: "高橋次郎", handle: "jiro", schoolId: school.id, departmentId: department.id },
  });
  const classmateTemplate = await prisma.timetableTemplate.create({
    data: { authorUserId: classmate.id, schoolId: school.id, departmentId: department.id, title: "情報処理科 2年 後期", description: "後期の標準時間割", year: 2, term: "後期", isPublic: true, copyCount: 3, daysOfWeek: "1,2,3,4,5,6" },
  });
  await prisma.templateDaySlot.createMany({
    data: [540, 640, 780, 880].map((startMinute, index) => ({ templateId: classmateTemplate.id, periodIndex: index + 1, label: `${index + 1}限`, startMinute, endMinute: startMinute + 90, isBreak: false })),
  });
  const classmateCourses = [] as { id: string }[];
  for (const [name, teacher, color] of [["プログラミング演習", "山田先生", "#3B82F6"], ["データベース", "佐々木先生", "#10B981"], ["ネットワーク基礎", "中村先生", "#F59E0B"]] as const) {
    classmateCourses.push(await prisma.templateCourse.create({ data: { templateId: classmateTemplate.id, name, teacher, color } }));
  }
  await prisma.templateMeeting.createMany({
    data: [
      { templateId: classmateTemplate.id, courseId: classmateCourses[0].id, dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1, room: "301" },
      { templateId: classmateTemplate.id, courseId: classmateCourses[1].id, dayOfWeek: 3, startPeriodIndex: 3, periodCount: 2, room: "305" },
      { templateId: classmateTemplate.id, courseId: classmateCourses[2].id, dayOfWeek: 5, startPeriodIndex: 2, periodCount: 1, room: "PC2" },
      { templateId: classmateTemplate.id, courseId: classmateCourses[0].id, dayOfWeek: 6, startPeriodIndex: 1, periodCount: 1, room: "301" },
    ],
  });

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

  // 学期終了と、8コマ・月〜土の引継ぎを確認するユーザー。
  const endedUser = await prisma.user.create({
    data: {
      id: DEMO_ENDED_USER_ID,
      email: "demo-ended@atender.local",
      emailVerified: true,
      name: "デモ花子",
      schoolId: school.id,
      departmentId: department.id,
      requiredAttendanceRate: 80,
    },
  });
  const endedSemester = await prisma.semester.create({
    data: {
      userId: endedUser.id,
      name: "2026 前期",
      startDate: dayjs().subtract(182, "day").startOf("day").toDate(),
      endDate: dayjs().subtract(1, "day").endOf("day").toDate(),
    },
  });
  await prisma.user.update({ where: { id: endedUser.id }, data: { defaultSemesterId: endedSemester.id } });
  const endedTimetable = await prisma.userTimetable.create({
    data: { userId: endedUser.id, semesterId: endedSemester.id, title: "2026 前期 時間割", daysOfWeek: "1,2,3,4,5,6" },
  });
  await prisma.daySlot.createMany({
    data: [540, 640, 780, 880, 980, 1080, 1180, 1280].map((startMinute, index) => ({
      userTimetableId: endedTimetable.id,
      periodIndex: index + 1,
      label: `${index + 1}限`,
      startMinute,
      endMinute: startMinute + 90,
      isBreak: false,
    })),
  });
  const endedCourse = await prisma.course.create({
    data: { userTimetableId: endedTimetable.id, name: "英語", color: "#EF4444" },
  });
  await prisma.meeting.create({
    data: { userTimetableId: endedTimetable.id, courseId: endedCourse.id, dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1 },
  });
  await generateOccurrencesForUserTimetable({ userTimetableId: endedTimetable.id });
  await prisma.session.create({
    data: {
      id: "demo-session-ios-ended",
      userId: endedUser.id,
      token: DEMO_ENDED_TOKEN,
      expiresAt: dayjs().add(365, "day").toDate(),
    },
  });

  // 退会 (アカウント削除) の UI テスト専用ユーザー。setup 完了のみで、時間割・ルーム・友達は作らない
  // (他のデモユーザーの UI テストに影響させない)。UI テスト #S2 が消すので、実行のたびに seed し直す。
  const deleteUser = await prisma.user.create({
    data: {
      id: DEMO_DELETE_USER_ID,
      email: "demo-delete@atender.local",
      emailVerified: true,
      name: "デモ削除",
      schoolId: school.id,
      departmentId: department.id,
      requiredAttendanceRate: 80,
    },
  });
  const deleteSemester = await prisma.semester.create({
    data: {
      userId: deleteUser.id,
      name: "2026 前期",
      startDate: dayjs().subtract(30, "day").startOf("day").toDate(),
      endDate: dayjs().add(150, "day").endOf("day").toDate(),
    },
  });
  await prisma.user.update({ where: { id: deleteUser.id }, data: { defaultSemesterId: deleteSemester.id } });
  await prisma.session.create({
    data: {
      id: "demo-session-ios-delete",
      userId: deleteUser.id,
      token: DEMO_DELETE_TOKEN,
      expiresAt: dayjs().add(365, "day").toDate(),
    },
  });

  console.log(JSON.stringify({
    userId: user.id, email: DEMO_EMAIL, semesterId: semester.id,
    occurrencesCreated: gen.created, pastOccurrences: past.length, attendanceRecorded: recorded,
    bearerToken: DEMO_TOKEN,
    endedUserBearerToken: DEMO_ENDED_TOKEN,
    deleteUserBearerToken: DEMO_DELETE_TOKEN,
    nextSemesterId: nextSemester.id,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
