import { useMe, useSemesters, useStats } from "@/api/hooks";
import { PageTitle, Panel, statusLabels } from "@/components/ui";

function rateText(rate: number | null) {
  return rate == null ? "—%" : `${(rate * 100).toFixed(1)}%`;
}

export function Stats() {
  const me = useMe();
  const semesters = useSemesters();
  const stats = useStats(me.data?.user.defaultSemesterId);
  const semester = semesters.data?.semesters.find((item) => item.id === me.data?.user.defaultSemesterId);

  return (
    <div>
      <PageTitle title="Stats::">{semester?.name ?? "出席率"}</PageTitle>
      <div className="space-y-4">
        {(stats.data?.courses ?? []).map((course) => {
          const presentBlocks = Math.round((course.attendanceRate ?? 0) * 15);
          const blocks = Array.from({ length: 15 }, (_, index) => index < presentBlocks);
          return (
            <Panel key={course.courseId}>
              <h2 className="text-xl font-black">{course.courseName}</h2>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex gap-1" aria-label="progress">
                  {blocks.map((filled, index) => <span key={index} className={`h-5 w-4 rounded-sm ${filled ? "bg-emerald-400" : "bg-white/16"}`} />)}
                </div>
                <span className="text-lg font-black">{course.effectiveNumerator}/{course.effectiveDenominator}</span>
                <span className="text-lg font-black">{rateText(course.attendanceRate)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/68">
                <span>{statusLabels.PRESENT} {course.counts.present}</span>
                <span>{statusLabels.ABSENT} {course.counts.absent}</span>
                <span>{statusLabels.EXCUSED} {course.counts.excused}</span>
                <span>{statusLabels.TARDY} {course.counts.tardy}</span>
                <span>{statusLabels.EARLY_LEAVE} {course.counts.earlyLeave}</span>
                <span>{statusLabels.CANCELLED} {course.counts.cancelled}</span>
                <span>未記録 {course.counts.unrecorded}</span>
              </div>
            </Panel>
          );
        })}
        {stats.data?.courses.length === 0 ? <Panel>まだ集計できる授業がありません</Panel> : null}
      </div>
    </div>
  );
}
