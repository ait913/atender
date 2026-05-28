import { ChevronDown, ChevronUp } from "lucide-react";
import { ATTENDANCE_STATUS, type AttendanceStatus, type OccurrenceDto } from "@atender/shared";
import { useIsKeyboardOpen } from "@/lib/useIsKeyboardOpen";
import { Button, statusLabels } from "@/components/ui";

type Props = {
  occurrences: OccurrenceDto[];
  expanded: boolean;
  onToggle: () => void;
  onMarkAll: () => void;
  onChangeStatus: (id: string, status: AttendanceStatus) => void;
  pending?: boolean;
};

export function MainAttendanceCTA(props: Props) {
  const keyboardOpen = useIsKeyboardOpen();
  return (
    <>
      {/* Mobile: CTA + 展開エリアを画面下端 fixed (展開エリアは CTA のすぐ上に出る) */}
      {!keyboardOpen ? (
        <section
          className="fixed inset-x-0 z-40 bg-bg-base/85 backdrop-blur-xl border-t border-fg-primary/8 md:hidden"
          style={{ bottom: "var(--tab-bar-height)", paddingTop: 8, paddingBottom: 8 }}
        >
          <div className="mx-auto w-full max-w-[920px] space-y-2 px-3">
            {props.expanded ? <ExpandedPanel {...props} /> : null}
            <CTAButtons {...props} />
          </div>
        </section>
      ) : null}
      {/* PC: sticky top */}
      <section className="sticky top-14 z-30 -mx-1 hidden rounded-3xl bg-bg-base/85 px-1 py-3 backdrop-blur-xl md:block">
        <CTAButtons {...props} />
        {props.expanded ? <div className="mt-3"><ExpandedPanel {...props} /></div> : null}
      </section>
    </>
  );
}

function ExpandedPanel({ occurrences, onChangeStatus }: Props) {
  return (
    <div className="max-h-[36dvh] space-y-4 overflow-y-auto rounded-2xl bg-bg-elevated p-3 shadow-card">
      {occurrences.map((occurrence) => (
        <div key={occurrence.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-base font-bold">
              <span className="text-accent-500">{occurrence.periodIndex}限</span>{" "}
              <span>{occurrence.courseName}</span>
            </p>
            <p className="text-xs text-fg-tertiary">{occurrence.room ?? ""}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {ATTENDANCE_STATUS.map((status) => {
              const selected = occurrence.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  className={`min-h-10 min-w-10 rounded-full px-3 text-[12px] font-bold transition active:scale-95 ${
                    selected
                      ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                      : "bg-fg-primary/8 text-fg-primary hover:bg-fg-primary/12"
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
  );
}

function CTAButtons({ occurrences, expanded, onToggle, onMarkAll, pending }: Props) {
  const unrecorded = occurrences.filter((occurrence) => occurrence.status == null).length;
  return (
    <div className="flex items-stretch gap-3">
      <Button
        type="button"
        variant={unrecorded === 0 ? "secondary" : "primary"}
        size="md"
        className="min-w-0 flex-1 text-sm"
        disabled={pending || unrecorded === 0}
        onClick={onMarkAll}
      >
        <span className="truncate">{unrecorded === 0 ? "本日の記録は完了済" : `今日は全出席 (${unrecorded})`}</span>
      </Button>
      <button
        type="button"
        className="grid h-12 w-12 place-items-center rounded-full bg-fg-primary/8 text-fg-primary transition hover:bg-fg-primary/14 active:scale-95"
        onClick={onToggle}
        aria-label={expanded ? "個別修正を閉じる" : "個別修正を開く"}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp className="h-5 w-5" strokeWidth={2.5} /> : <ChevronDown className="h-5 w-5" strokeWidth={2.5} />}
      </button>
    </div>
  );
}
