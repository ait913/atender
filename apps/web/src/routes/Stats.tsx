import { useMemo, useState } from "react";
import type { CourseStatsDto } from "@atender/shared";
import { useMe, useSemesters, useStats } from "@/api/hooks";
import { CourseStatsCard } from "@/components/stats/CourseStatsCard";
import { CourseStatsDetailSheet } from "@/components/stats/CourseStatsDetailSheet";
import { EmptyState, Page, Select, Skeleton } from "@/components/ui";

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
    <Page className="grid gap-4">
      <Select value={selectedSemesterId ?? ""} onChange={(event) => selectSemester(event.target.value)}>
        {semesters.data?.semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
      </Select>
      {stats.isLoading ? <Skeleton className="h-48" /> : null}
      {!stats.isLoading && courses.length === 0 ? <EmptyState title="まだ授業がありません。時間割を作る" /> : null}
      {courses.length > 0 ? (
        <>
          <section className="rounded-md border border-border-subtle bg-bg-elevated p-4 shadow-card">
            <p className="text-sm text-fg-secondary">全体</p>
            <p className="mt-1 text-xl font-bold">{total.numerator} / {total.denominator} コマ {total.rate == null ? "—%" : `${(total.rate * 100).toFixed(1)}%`}</p>
          </section>
          {danger.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="text-sm font-semibold text-status-absent">出席率 70% 未満</h2>
              {danger.map((course) => <CourseStatsCard key={`danger-${course.courseId}`} course={course} danger onClick={() => setSelectedCourse(course)} />)}
            </section>
          ) : null}
          <section className="grid gap-3">
            <h2 className="text-sm font-semibold text-fg-secondary">全科目</h2>
            {courses.map((course) => <CourseStatsCard key={course.courseId} course={course} onClick={() => setSelectedCourse(course)} />)}
          </section>
        </>
      ) : null}
      <CourseStatsDetailSheet open={selectedCourse != null} course={selectedCourse} onClose={() => setSelectedCourse(null)} />
    </Page>
  );
}
