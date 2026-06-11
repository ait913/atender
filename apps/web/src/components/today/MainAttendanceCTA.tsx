import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ATTENDANCE_STATUS, type AttendanceStatus, type OccurrenceDto } from "@atender/shared";
import { useIsKeyboardOpen } from "@/lib/useIsKeyboardOpen";
import { Button, statusLabels, statusLongLabels } from "@/components/ui";

export type BulkAttendanceStatus = Exclude<AttendanceStatus, "CANCELLED">;

const BULK_STATUSES: BulkAttendanceStatus[] = ["ABSENT", "EXCUSED", "TARDY", "EARLY_LEAVE"];

type Props = {
  occurrences: OccurrenceDto[];
  expanded: boolean;
  onToggle: () => void;
  onMarkAll: (status: BulkAttendanceStatus) => void;
  onChangeStatus: (id: string, status: AttendanceStatus) => void;
  pending?: boolean;
};

export function MainAttendanceCTA(props: Props) {
  const keyboardOpen = useIsKeyboardOpen();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const unrecorded = props.occurrences.filter((occurrence) => occurrence.status == null).length;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (keyboardOpen) return null;

  return (
    <section className="fixed inset-x-0 bottom-[var(--tab-bar-height)] z-40 border-t border-fg-primary/8 bg-bg-base/85 py-2 backdrop-blur-xl md:bottom-0 md:left-60">
      <div className="mx-auto w-full max-w-[920px] space-y-2 px-3 md:px-6">
        {props.expanded ? <ExpandedPanel {...props} /> : null}
        <CTAButtons {...props} menuOpen={menuOpen} setMenuOpen={setMenuOpen} menuRef={menuRef} unrecorded={unrecorded} />
      </div>
    </section>
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

function CTAButtons({
  expanded,
  onToggle,
  onMarkAll,
  pending,
  menuOpen,
  setMenuOpen,
  menuRef,
  unrecorded,
}: Props & {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  menuRef: RefObject<HTMLDivElement | null>;
  unrecorded: number;
}) {
  const disabled = pending || unrecorded === 0;
  const triggerClasses = unrecorded === 0
    ? "bg-fg-primary/8 text-fg-primary hover:bg-fg-primary/12 active:scale-[0.97] border-fg-primary/15"
    : "bg-accent-500 text-fg-on-accent shadow-glow-soft hover:bg-accent-600 hover:shadow-glow active:scale-[0.97] border-fg-on-accent/25";

  function markAll(status: BulkAttendanceStatus) {
    setMenuOpen(false);
    onMarkAll(status);
  }

  return (
    <div className="flex items-stretch gap-3">
      <div ref={menuRef} className="relative flex min-w-0 flex-1 items-stretch">
        {menuOpen ? (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-2xl bg-bg-elevated p-1.5 shadow-card" role="menu">
            {BULK_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-fg-primary transition hover:bg-fg-primary/8 active:scale-[0.98]"
                onClick={() => markAll(status)}
              >
                全部 {statusLongLabels[status]} ({unrecorded})
              </button>
            ))}
          </div>
        ) : null}
        <Button
          type="button"
          variant={unrecorded === 0 ? "secondary" : "primary"}
          size="md"
          className="min-w-0 flex-1 rounded-r-none text-sm"
          disabled={disabled}
          onClick={() => markAll("PRESENT")}
        >
          <span className="truncate">{unrecorded === 0 ? "本日の記録は完了済" : `今日は全出席 (${unrecorded})`}</span>
        </Button>
        <button
          type="button"
          className={`grid min-h-12 w-11 shrink-0 place-items-center rounded-l-none rounded-r-full border-l font-bold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed disabled:opacity-40 ${triggerClasses}`}
          disabled={disabled}
          onClick={() => {
            if (!disabled) setMenuOpen(!menuOpen);
          }}
          aria-label="一括記録のステータスを選ぶ"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <ChevronsUpDown className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
      <button
        type="button"
        className="grid h-12 w-12 place-items-center rounded-full bg-fg-primary/8 text-fg-primary transition hover:bg-fg-primary/14 active:scale-95"
        onClick={onToggle}
        aria-label={expanded ? "個別修正を閉じる" : "個別修正を開く"}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-5 w-5" strokeWidth={2.5} /> : <ChevronUp className="h-5 w-5" strokeWidth={2.5} />}
      </button>
    </div>
  );
}
