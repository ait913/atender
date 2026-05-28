import { useSemesterOverview } from "@/api/hooks";

type Props = { courseId: string; semesterId: string | null };

export function CourseOccurrenceHistory({ courseId, semesterId }: Props) {
  const overview = useSemesterOverview(semesterId);
  const courseStat = overview.data?.courses.find((course) => course.courseId === courseId);
  if (!courseStat) return null;
  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <h3 className="mb-3 text-base font-bold">出席履歴</h3>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Stat label="出席" value={courseStat.counts.present} color="status-present" />
        <Stat label="欠席" value={courseStat.counts.absent} color="status-absent" />
        <Stat label="遅刻" value={courseStat.counts.tardy} color="status-tardy" />
        <Stat label="早退" value={courseStat.counts.earlyLeave} color="status-early" />
        <Stat label="公欠" value={courseStat.counts.excused} color="status-excused" />
        <Stat label="休講 (個別)" value={courseStat.counts.cancelled} color="status-cancelled" />
        <Stat label="休講 (一括)" value={courseStat.counts.suspended} color="status-cancelled" />
        <Stat label="未記録" value={courseStat.counts.unrecorded} color="fg-tertiary" />
      </div>
      <p className="mt-3 text-xs text-fg-tertiary tabular-nums">
        {courseStat.effectiveNumerator} / {courseStat.effectiveDenominator} = {courseStat.attendanceRate == null ? "—" : `${(courseStat.attendanceRate * 100).toFixed(1)}%`}
      </p>
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const cssColor = color === "fg-tertiary" ? "var(--color-text-tertiary)" : `var(--color-${color})`;
  return (
    <div className="rounded-2xl bg-bg-muted/50 px-3 py-2">
      <p className="text-[10px] font-bold text-fg-tertiary">{label}</p>
      <p className="text-xl font-black tabular-nums" style={{ color: cssColor }}>{value}</p>
    </div>
  );
}
