import { useMemo, useState } from "react";
import type { CourseStatsDto } from "@atender/shared";
import { useMe, useSemesters, useStats } from "@/api/hooks";
import { PageTitle, Panel, statusLongLabels } from "@/components/ui";

function rateText(rate: number | null) {
  return rate == null ? "-%" : `${(rate * 100).toFixed(1)}%`;
}

export function Stats() {
  const params = new URLSearchParams(window.location.search);
  const me = useMe();
  const semesters = useSemesters();
  const [selectedCourse, setSelectedCourse] = useState<CourseStatsDto | null>(null);
  const selectedSemesterId = params.get("semesterId") ?? me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id ?? null;
  const stats = useStats(selectedSemesterId);
  const courses = stats.data?.courses ?? [];
  const danger = courses.filter((course) => course.attendanceRate != null && course.attendanceRate < 0.7);
  const total = useMemo(() => {
    const numerator = courses.reduce((sum, course) => sum + course.effectiveNumerator, 0);
    const denominator = courses.reduce((sum, course) => sum + course.effectiveDenominator, 0);
    return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
  }, [courses]);

  function selectSemester(value: string) {
    const search = new URLSearchParams(window.location.search);
    search.set("semesterId", value);
    window.history.replaceState(null, "", `${window.location.pathname}?${search.toString()}`);
  }

  return (
    <div>
      <PageTitle title="出席率">{semester?.name ?? "出席率"}</PageTitle>
      <div className="space-y-4">
        {(stats.data?.courses ?? []).map((course) => (
          <Panel key={course.courseId}>
            <h2 className="text-xl font-semibold">{course.courseName}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-lg font-bold">{course.effectiveNumerator}/{course.effectiveDenominator}</span>
              <span className="text-lg font-bold">{rateText(course.attendanceRate)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-fg-secondary">
              <span>{statusLongLabels.PRESENT} {course.counts.present}</span>
              <span>{statusLongLabels.ABSENT} {course.counts.absent}</span>
              <span>{statusLongLabels.EXCUSED} {course.counts.excused}</span>
              <span>{statusLongLabels.TARDY} {course.counts.tardy}</span>
              <span>{statusLongLabels.EARLY_LEAVE} {course.counts.earlyLeave}</span>
              <span>{statusLongLabels.CANCELLED} {course.counts.cancelled}</span>
              <span>未記録 {course.counts.unrecorded}</span>
            </div>
          </Panel>
        ))}
        {stats.data?.courses.length === 0 ? <Panel>まだ集計できる授業がありません</Panel> : null}
      </div>
    </div>
  );
}
