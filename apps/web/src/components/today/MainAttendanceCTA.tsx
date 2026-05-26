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
    <section className="sticky top-14 z-30 -mx-1 rounded-3xl bg-bg-base/85 px-1 py-3 backdrop-blur-xl">
      <div className="flex items-stretch gap-2">
        <Button
          type="button"
          variant={unrecorded === 0 ? "secondary" : "primary"}
          size="lg"
          className="min-w-0 flex-1 text-base"
          disabled={pending || unrecorded === 0}
          onClick={onMarkAll}
        >
          <span className="truncate">{unrecorded === 0 ? "本日の記録は完了済" : `今日は全出席 (${unrecorded})`}</span>
        </Button>
        <button
          type="button"
          className="grid h-14 w-14 place-items-center rounded-full bg-white/8 text-xl font-bold text-fg-primary transition hover:bg-white/14 active:scale-95"
          onClick={onToggle}
          aria-label="個別修正を開く"
          aria-expanded={expanded}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-4 rounded-3xl bg-bg-elevated p-5 shadow-card">
          {occurrences.map((occurrence) => (
            <div key={occurrence.id} className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-base font-bold">
                  <span className="text-accent-500">{occurrence.periodIndex}限</span>{" "}
                  <span>{occurrence.courseName}</span>
                </p>
                <p className="text-xs text-fg-tertiary">{occurrence.room ?? ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ATTENDANCE_STATUS.map((status) => {
                  const selected = occurrence.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`h-10 min-w-12 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
                        selected
                          ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                          : "bg-white/8 text-fg-primary hover:bg-white/12"
                      }`}
                      onClick={() => onChangeStatus(occurrence.id, status)}
                    >
                      {statusLabels[status]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
