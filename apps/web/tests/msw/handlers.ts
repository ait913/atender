import { http, HttpResponse } from "msw";

export const API_URL = "http://localhost:3000";

type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "EXCUSED"
  | "TARDY"
  | "EARLY_LEAVE"
  | "CANCELLED";

export const defaultMe = {
  user: {
    id: "user-1",
    email: "teacher@example.com",
    name: "田中",
    image: null,
    defaultSemesterId: "semester-1",
    schoolId: "school-1",
    departmentId: "department-1",
  },
  setupStatus: {
    hasSchool: true,
    hasDepartment: true,
    hasSemester: true,
    hasUserTimetable: true,
    isComplete: true,
  },
};

export const setupRequiredMe = {
  user: {
    ...defaultMe.user,
    defaultSemesterId: null,
    schoolId: null,
    departmentId: null,
  },
  setupStatus: {
    hasSchool: false,
    hasDepartment: false,
    hasSemester: false,
    hasUserTimetable: false,
    isComplete: false,
  },
};

export const defaultOccurrences = [
  occurrence("occ-1", "数学I", 1, null),
  occurrence("occ-2", "英語", 2, null),
  occurrence("occ-3", "化学", 3, "PRESENT"),
  occurrence("occ-4", "現代文", 4, null),
];

export function occurrence(
  id: string,
  courseName: string,
  periodIndex: number,
  status: AttendanceStatus | null,
) {
  return {
    id,
    meetingId: `meeting-${id}`,
    courseId: `course-${id}`,
    courseName,
    teacher: "山田先生",
    room: "101",
    color: "#2f80ed",
    date: "2026-05-13",
    periodIndex,
    periodOffset: 0,
    startMinute: 540 + periodIndex * 60,
    endMinute: 590 + periodIndex * 60,
    status,
  };
}

export const handlers = [
  http.get(`${API_URL}/api/me`, () => HttpResponse.json(defaultMe)),

  http.patch(`${API_URL}/api/me`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...defaultMe,
      user: {
        ...defaultMe.user,
        ...body,
      },
    });
  }),

  http.get(`${API_URL}/api/today`, () =>
    HttpResponse.json({
      date: "2026-05-13",
      occurrences: defaultOccurrences,
    }),
  ),

  http.post(`${API_URL}/api/attendance/mark-all-present`, async () =>
    HttpResponse.json({
      date: "2026-05-13",
      markedCount: 3,
      skippedCount: 1,
    }),
  ),

  http.post(`${API_URL}/api/attendance/:occurrenceId`, async ({ params, request }) => {
    const body = (await request.json()) as { status: AttendanceStatus; note?: string };
    return HttpResponse.json({
      record: {
        occurrenceId: params.occurrenceId,
        status: body.status,
        note: body.note ?? null,
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
    });
  }),

  http.get(`${API_URL}/api/schools`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      schools: [
        {
          id: "school-1",
          name: url.searchParams.get("q") || "東京テスト高校",
          prefecture: url.searchParams.get("prefecture") || "東京都",
        },
      ],
    });
  }),

  http.post(`${API_URL}/api/schools`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; prefecture?: string };
    return HttpResponse.json(
      {
        school: {
          id: "school-new",
          name: body.name ?? "追加した学校",
          prefecture: body.prefecture ?? "東京都",
        },
      },
      { status: 201 },
    );
  }),

  http.get(`${API_URL}/api/schools/:id/departments`, ({ request, params }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      departments: [
        {
          id: "department-1",
          schoolId: params.id,
          name: url.searchParams.get("q") || "普通科",
        },
      ],
    });
  }),

  http.post(`${API_URL}/api/schools/:id/departments`, async ({ request, params }) => {
    const body = (await request.json()) as { name?: string };
    return HttpResponse.json(
      {
        department: {
          id: "department-new",
          schoolId: params.id,
          name: body.name ?? "追加した学科",
        },
      },
      { status: 201 },
    );
  }),

  http.get(`${API_URL}/api/semesters`, () =>
    HttpResponse.json({
      semesters: [
        {
          id: "semester-1",
          name: "前期",
          startDate: "2026-04-01",
          endDate: "2026-09-30",
        },
      ],
    }),
  ),

  http.post(`${API_URL}/api/semesters`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        semester: {
          id: "semester-new",
          ...body,
        },
      },
      { status: 201 },
    );
  }),

  http.get(`${API_URL}/api/timetable-templates`, () =>
    HttpResponse.json({
      templates: [
        {
          id: "template-1",
          authorUserId: "author-1",
          schoolId: "school-1",
          departmentId: "department-1",
          title: "普通科 1年前期",
          description: "標準テンプレート",
          year: 2026,
          term: "前期",
          isPublic: true,
          copyCount: 12,
          daySlots: [],
          courses: [],
          meetings: [],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    }),
  ),

  http.post(`${API_URL}/api/timetable-templates/:id/copy`, async () =>
    HttpResponse.json(
      {
        userTimetable: {
          id: "user-timetable-1",
          title: "コピーした時間割",
        },
      },
      { status: 201 },
    ),
  ),

  http.post(`${API_URL}/api/user-timetables/:id/publish-as-template`, async () =>
    HttpResponse.json({
      template: {
        id: "published-template-1",
      },
    }),
  ),

  http.get(`${API_URL}/api/stats`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      semesterId: url.searchParams.get("semesterId") || "semester-1",
      courses: [
        {
          courseId: "course-1",
          courseName: "数学I",
          totalSessions: 15,
          generatedOccurrences: 15,
          counts: {
            present: 13,
            absent: 2,
            excused: 0,
            tardy: 0,
            earlyLeave: 0,
            cancelled: 0,
            unrecorded: 0,
          },
          effectiveNumerator: 13,
          effectiveDenominator: 15,
          attendanceRate: 86.7,
        },
        {
          courseId: "course-2",
          courseName: "未記録科目",
          totalSessions: 0,
          generatedOccurrences: 0,
          counts: {
            present: 0,
            absent: 0,
            excused: 0,
            tardy: 0,
            earlyLeave: 0,
            cancelled: 0,
            unrecorded: 0,
          },
          effectiveNumerator: 0,
          effectiveDenominator: 0,
          attendanceRate: null,
        },
      ],
    });
  }),

  http.get(`${API_URL}/api/attendance-rules`, () =>
    HttpResponse.json({
      default: null,
      userOverride: null,
      effective: {
        excusedStrategy: "EXCUSED",
        tardyStrategy: "HALF",
        earlyLeaveStrategy: "HALF",
      },
    }),
  ),

  http.patch(`${API_URL}/api/attendance-rules/default`, async ({ request }) =>
    HttpResponse.json({
      rule: {
        id: "rule-default",
        ...((await request.json()) as Record<string, unknown>),
      },
    }),
  ),

  http.patch(`${API_URL}/api/attendance-rules/user`, async ({ request }) =>
    HttpResponse.json({
      rule: {
        id: "rule-user",
        ...((await request.json()) as Record<string, unknown>),
      },
    }),
  ),

  http.post(`${API_URL}/api/auth/sign-in/magic-link`, async () =>
    HttpResponse.json({ ok: true }),
  ),

  http.get(`${API_URL}/api/auth/magic-link/verify`, async () =>
    HttpResponse.json({ ok: true }),
  ),

  http.post(`${API_URL}/api/auth/sign-out`, async () =>
    HttpResponse.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": "session=; Max-Age=0",
        },
      },
    ),
  ),
];
