import type { OccurrenceDto } from "@atender/shared";
import { StatusChip } from "@/components/attendance/StatusChip";
import { cx } from "@/components/ui/cx";
import { minutesToTime } from "@/lib/dayjs";

export function OccurrenceCard({
  occurrences,
  mergedTitle,
  color,
  teacher,
  room,
  onChipTap,
}: {
  occurrences: OccurrenceDto[];
  mergedTitle: string;
  color: string | null;
  teacher: string | null;
  room: string | null;
  onChipTap: (occurrenceId: string) => void;
}) {
  const first = occurrences[0];
  const last = occurrences[occurrences.length - 1];
  const periodLabel = occurrences.length > 1 ? `${first.periodIndex}-${last.periodIndex}限` : first.periodLabel;
  return (
    <article className="rounded-md border border-border-subtle bg-bg-elevated p-4 shadow-card" style={{ borderLeft: `4px solid ${color ?? "#10B981"}` }}>
      <header className="flex items-center justify-between gap-3 text-sm font-semibold text-fg-secondary">
        <span>{periodLabel}</span>
        <span>{minutesToTime(first.startMinute)}-{minutesToTime(last.endMinute)}</span>
      </header>
      <h3 className="mt-2 text-base font-semibold text-fg-primary">{mergedTitle}</h3>
      <p className={cx("mt-1 text-sm text-fg-secondary", !teacher && !room && "text-fg-tertiary")}>{teacher ?? "-"} / {room ?? "-"}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {occurrences.map((occurrence) => (
          <StatusChip key={occurrence.id} status={occurrence.status} label={occurrences.length > 1 ? `${occurrence.periodIndex}限` : undefined} onTap={() => onChipTap(occurrence.id)} />
        ))}
      </div>
    </article>
  );
}
