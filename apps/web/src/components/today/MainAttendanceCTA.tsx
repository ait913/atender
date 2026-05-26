import { ATTENDANCE_STATUS, type AttendanceStatus, type OccurrenceDto } from "@atender/shared";
import { Button, statusLabels } from "@/components/ui";

export function MainAttendanceCTA({
  occurrences,
  expanded,
  onToggle,
  onMarkAll,
  onChangeStatus,
  pending,
}: {
  occurrences: OccurrenceDto[];
  expanded: boolean;
  onToggle: () => void;
  onMarkAll: () => void;
  onChangeStatus: (id: string, status: AttendanceStatus) => void;
  pending?: boolean;
}) {
  const unrecorded = occurrences.filter((occurrence) => occurrence.status == null).length;
  return (
    <section className="sticky top-0 z-20 -mx-1 rounded-md bg-bg-base/95 py-3 backdrop-blur">
      <div className="flex gap-2">
        <Button type="button" variant={unrecorded === 0 ? "secondary" : "primary"} size="lg" className="min-w-0 flex-1" disabled={pending || unrecorded === 0} onClick={onMarkAll}>
          <span className="truncate">{unrecorded === 0 ? "本日の記録は完了済" : `今日は全出席 (${unrecorded} 件)`}</span>
        </Button>
        <button
          type="button"
          className="min-h-12 w-12 rounded-md border border-border-default bg-bg-elevated text-base font-semibold text-fg-primary transition hover:bg-bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          onClick={onToggle}
          aria-label="個別修正を開く"
        >
          {expanded ? "⌃" : "⌄"}
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-3 rounded-md border border-border-subtle bg-bg-elevated p-3 shadow-card">
          {occurrences.map((occurrence) => (
            <div key={occurrence.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{occurrence.periodIndex}限 {occurrence.courseName}</p>
                <p className="text-xs text-fg-tertiary">{occurrence.room ?? ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ATTENDANCE_STATUS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`h-9 min-w-9 rounded-full border px-3 text-sm font-semibold ${occurrence.status === status ? "border-transparent bg-accent-500 text-white" : "border-border-default bg-bg-base text-fg-primary"}`}
                    onClick={() => onChangeStatus(occurrence.id, status)}
                  >
                    {statusLabels[status]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
