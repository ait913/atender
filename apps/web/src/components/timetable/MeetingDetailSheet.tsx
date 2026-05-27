import type { CourseDto, DaySlotDto, MeetingDto } from "@atender/shared";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, minutesToTime } from "@/components/ui";

const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function hexWithAlpha(hex: string, alphaHex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alphaHex}`;
  return hex;
}

export function MeetingDetailSheet({
  open,
  onClose,
  meeting,
  course,
  slots,
  onDelete,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDto | null;
  course: CourseDto | null;
  slots: DaySlotDto[];
  onDelete: () => void;
  pending?: boolean;
}) {
  const first = slots[0];
  const last = slots[slots.length - 1];
  const color = course?.color ?? "#10EB99";
  const bg = hexWithAlpha(color, "26"); // ~15%
  const periodLabel = first && last && slots.length > 1
    ? `${first.periodIndex}-${last.periodIndex}`
    : first
      ? String(first.periodIndex)
      : "";
  return (
    <BottomSheet open={open} onClose={onClose} title="授業の詳細">
      {course && meeting && first && last ? (
        <div className="space-y-5">
          <div className="rounded-3xl p-5" style={{ background: bg }}>
            <div className="flex items-stretch gap-5">
              <div className="flex flex-shrink-0 flex-col items-center justify-center">
                <span
                  className={`font-black leading-none tracking-tight ${
                    periodLabel.length > 2 ? "text-5xl" : "text-7xl"
                  }`}
                  style={{ color }}
                >
                  {periodLabel}
                </span>
                <span
                  className="mt-1.5 text-xs font-bold uppercase tracking-widest opacity-80"
                  style={{ color }}
                >
                  限
                </span>
              </div>
              <div
                className="flex min-w-0 flex-1 flex-col justify-center gap-2 pl-5"
                style={{ borderLeft: `1px solid ${hexWithAlpha(color, "44")}` }}
              >
                <h3 className="text-2xl font-black leading-tight text-fg-primary">{course.name}</h3>
                <p className="text-sm font-semibold" style={{ color }}>
                  {dayLabels[meeting.dayOfWeek]}曜日 · {minutesToTime(first.startMinute)} – {minutesToTime(last.endMinute)}
                </p>
              </div>
            </div>
          </div>
          <dl className="space-y-3 text-sm">
            <Row label="教室" value={course.room} />
            <Row label="先生" value={course.teacher} />
            <Row label="メモ" value={course.note} />
          </dl>
          <div className="-mx-5 border-t border-border-subtle bg-bg-elevated px-5 py-3 sticky bottom-0">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>閉じる</Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={onDelete}>削除</Button>
            </div>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/4 px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">{label}</dt>
      <dd className="text-base font-medium text-fg-primary">{value ?? "—"}</dd>
    </div>
  );
}
