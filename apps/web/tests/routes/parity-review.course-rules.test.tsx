/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.6 / §7.CO (CO1-CO9)
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import { findCalls, recordCalls, stopRecording, timetable, useMe, useTimetables } from "../utils/parity-fixtures";

afterEach(() => {
  stopRecording();
  vi.useRealTimers();
});

const counts0 = { present: 1, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, cancelled: 0, suspended: 0, unrecorded: 0 };

function courseStats(over: any = {}) {
  return {
    courseId: "c1", courseName: "数学I", teacher: "山田", generatedOccurrences: 10, counts: counts0,
    effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1,
    toDate: { effectiveNumerator: 3, effectiveDenominator: 4, attendanceRate: 0.75 },
    remainingCount: 9, allowedAbsences: 2, maxDayPeriods: 1, allowedAbsenceDays: 2, ...over,
  };
}

function useOverview(courses: any[], requiredAttendanceRate = 70) {
  server.use(
    http.get(`${API_URL}/api/semesters/:id/overview`, ({ params }) =>
      HttpResponse.json({
        semesterId: params.id, semesterName: "前期", startDate: "2026-04-01", endDate: "2099-03-31", today: "2026-05-13", requiredAttendanceRate,
        overall: { effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1, toDate: { effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1 }, unrecordedCount: 0, remainingCount: 5, allowedAbsences: 2 },
        days: [], courses,
      }),
    ),
  );
}

const tcourse = (rule: any = {}) => ({
  id: "c1", name: "数学I", teacher: "山田", color: "#2f80ed", note: null,
  requiredAttendanceRate: null, maxAbsences: null, tardiesPerAbsence: null, ...rule,
});

type View = Awaited<ReturnType<typeof renderApp>>;

async function openEdit(rule: any, meRate: number | undefined = undefined) {
  useTimetables([timetable({ courses: [tcourse(rule)] })]);
  useOverview([courseStats()]);
  if (meRate !== undefined) useMe({ requiredAttendanceRate: meRate });
  const v = await renderApp({ initialPath: "/semester" });
  await v.user.click(await screen.findByText("数学I"));
  await v.user.click(await screen.findByRole("button", { name: "編集" }));
  await screen.findByRole("heading", { name: "科目を編集" });
  return v;
}

const rateT = () => screen.getByTestId("course-rule-rate-toggle") as HTMLInputElement;
const maxT = () => screen.getByTestId("course-rule-max-absences-toggle") as HTMLInputElement;
const tardyT = () => screen.getByTestId("course-rule-tardy-toggle") as HTMLInputElement;
const stepperValue = (label: string) => {
  const dec = screen.getByRole("button", { name: `${label} decrease` });
  return dec.parentElement!.querySelector("output")!.textContent;
};

describe("[CO] course attendance rules", () => {
  it("[CO1] existing (80, null, 3): rate ON 80, max OFF, tardy ON 3", async () => {
    await openEdit({ requiredAttendanceRate: 80, tardiesPerAbsence: 3 });
    expect(screen.getByText("出席の基準")).toBeInTheDocument();
    expect(rateT().checked).toBe(true);
    expect(stepperValue("必要出席率")).toBe("80");
    expect(maxT().checked).toBe(false);
    expect(tardyT().checked).toBe(true);
    expect(stepperValue("遅刻・早退の換算")).toBe("3");
    expect(screen.getByText("回数は授業の回数です。同じ日のコマはまとめて 1 回と数えます。")).toBeInTheDocument();
  });

  it("[CO2] toggling ON from null: max -> 5, rate -> user's rate (75)", async () => {
    const v = await openEdit({}, 75);
    expect([rateT().checked, maxT().checked, tardyT().checked]).toEqual([false, false, false]);
    await v.user.click(maxT());
    expect(stepperValue("欠席上限")).toBe("5");
    await v.user.click(rateT());
    expect(stepperValue("必要出席率")).toBe("75");
  });

  it("[CO3] footnote follows toggles", async () => {
    const v = await openEdit({}, 75);
    expect(screen.getByText("未設定の項目は共通の必要出席率（75%）で判定します")).toBeInTheDocument();
    await v.user.click(rateT());
    expect(screen.getByText("この科目は 75% で判定します")).toBeInTheDocument();
    await v.user.click(rateT());
    await v.user.click(maxT());
    expect(screen.getByText("この科目は回数の上限で判定します（共通の必要出席率は使いません）")).toBeInTheDocument();
    await v.user.click(rateT());
    expect(screen.getByText("出席率と回数の厳しい方で「あと何回休めるか」を出します")).toBeInTheDocument();
  });

  it("[CO4] edit save: PATCH has all 3 keys (null for OFF)", async () => {
    const calls = recordCalls();
    const v = await openEdit({}, 70);
    await v.user.click(maxT());
    await v.user.click(screen.getByRole("button", { name: "欠席上限 decrease" }));
    expect(stepperValue("欠席上限")).toBe("4");
    server.use(http.patch(`${API_URL}/api/courses/:id`, async ({ request }) => HttpResponse.json({ course: { ...tcourse(), ...((await request.json()) as any) } })));
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(findCalls(calls, "PATCH", /^\/api\/courses\/c1$/)).toHaveLength(1));
    const body = findCalls(calls, "PATCH", /^\/api\/courses\/c1$/)[0]!.body;
    expect(Object.keys(body)).toEqual(expect.arrayContaining(["requiredAttendanceRate", "maxAbsences", "tardiesPerAbsence"]));
    expect(body.requiredAttendanceRate).toBeNull();
    expect(body.maxAbsences).toBe(4);
    expect(body.tardiesPerAbsence).toBeNull();
    expect(body.name).toBe("数学I");
  });

  async function openNewCourse(): Promise<View> {
    useTimetables([timetable()]);
    server.use(
      http.post(`${API_URL}/api/courses`, async ({ request }) => HttpResponse.json({ course: { id: "c-new", ...((await request.json()) as any), teacher: null, color: "#2f80ed", note: null } }, { status: 201 })),
    );
    const v = await renderApp({ initialPath: "/" });
    await screen.findByRole("button", { name: "数学I" });
    await v.user.click(screen.getAllByRole("button", { name: "+" })[0]!);
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "__add_course__" } });
    await screen.findByRole("heading", { name: "科目を追加" });
    const nameLabel = screen.getByText("科目名").closest("label")!;
    await v.user.type(nameLabel.querySelector("input")!, "新科目");
    return v;
  }

  it("[CO5] new course, all OFF: POST has none of the 3 keys", async () => {
    const calls = recordCalls();
    const v = await openNewCourse();
    expect(rateT().checked).toBe(false);
    expect(maxT().checked).toBe(false);
    expect(tardyT().checked).toBe(false);
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/courses$/)).toHaveLength(1));
    const body = findCalls(calls, "POST", /^\/api\/courses$/)[0]!.body;
    expect(body.name).toBe("新科目");
    for (const k of ["requiredAttendanceRate", "maxAbsences", "tardiesPerAbsence"]) expect(k in body, k).toBe(false);
  });

  it("[CO6] new course, rate ON 60: only that key", async () => {
    const calls = recordCalls();
    const v = await openNewCourse();
    await v.user.click(rateT());
    for (let i = 0; i < 10; i++) await v.user.click(screen.getByRole("button", { name: "必要出席率 decrease" }));
    expect(stepperValue("必要出席率")).toBe("60");
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/courses$/)).toHaveLength(1));
    const body = findCalls(calls, "POST", /^\/api\/courses$/)[0]!.body;
    expect(body.requiredAttendanceRate).toBe(60);
    expect("maxAbsences" in body).toBe(false);
    expect("tardiesPerAbsence" in body).toBe(false);
  });

  it("[CO7a] detail summary: all null -> 共通", async () => {
    useTimetables([timetable({ courses: [tcourse()] })]);
    useOverview([courseStats()]);
    const v = await renderApp({ initialPath: "/semester" });
    await v.user.click(await screen.findByText("数学I"));
    expect(await screen.findByTestId("course-detail-rule-summary")).toHaveTextContent("基準: 共通（70%）");
  });

  it("[CO7b] detail summary: (80, 4, null)", async () => {
    useTimetables([timetable({ courses: [tcourse({ requiredAttendanceRate: 80, maxAbsences: 4 })] })]);
    useOverview([courseStats()]);
    const v = await renderApp({ initialPath: "/semester" });
    await v.user.click(await screen.findByText("数学I"));
    expect(await screen.findByTestId("course-detail-rule-summary")).toHaveTextContent("基準: 出席率 80% ・ 欠席 4 回まで");
  });

  it("[CO8] row uses per-course required rate: 75% < 80% -> absent color, marker at 80%", async () => {
    useTimetables([timetable({ courses: [tcourse()] })]);
    useOverview([courseStats({ requiredAttendanceRate: 80 })], 70);
    const { container } = await renderApp({ initialPath: "/semester" });
    const row = (await screen.findByText("数学I")).closest("button") as HTMLElement;
    expect(row.querySelector('[style*="--color-status-absent"]')).not.toBeNull();
    expect(row.querySelector('[style*="left: 80%"]')).not.toBeNull();
    void container;
  });

  it("[CO8b] without course rate, 75% >= 70% is not absent-colored", async () => {
    useTimetables([timetable({ courses: [tcourse()] })]);
    useOverview([courseStats()], 70);
    await renderApp({ initialPath: "/semester" });
    const row = (await screen.findByText("数学I")).closest("button") as HTMLElement;
    expect(row.querySelector('[style*="left: 70%"]')).not.toBeNull();
    expect(row.querySelector('[style*="--color-status-absent"]')).toBeNull();
  });

  it("[CO9] row action text from allowedAbsenceLessons", async () => {
    useTimetables([timetable({ courses: [tcourse()] })]);
    useOverview([courseStats({ allowedAbsenceLessons: 2, remainingLessons: 9, limitedBy: "rate" })]);
    await renderApp({ initialPath: "/semester" });
    const row = (await screen.findByText("数学I")).closest("button") as HTMLElement;
    expect(within(row).getByText(/あと2回休める/)).toBeInTheDocument();
  });
});
