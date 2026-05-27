import type { CourseDto, DaySlotDto, MeetingDto } from "@atender/shared";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, minutesToTime } from "@/components/ui";

const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];

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
  const bg = /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}26` : color; // ~15%
  return (
    <BottomSheet open={open} onClose={onClose} title="授業の詳細">
      {course && meeting && first && last ? (
        <div className="space-y-5">
          <div
            className="rounded-3xl p-5"
            style={{ background: bg, borderLeft: `4px solid ${color}` }}
          >
            <h3 className="text-2xl font-black leading-tight">{course.name}</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-sm font-semibold" style={{ color }}>
              <span>{dayLabels[meeting.dayOfWeek]}曜日</span>
              <span aria-hidden>·</span>
              <span>
                {slots.length === 1 ? `${first.periodIndex}限` : `${first.periodIndex}-${last.periodIndex}限`}
              </span>
              <span aria-hidden>·</span>
              <span>
                {minutesToTime(first.startMinute)} - {minutesToTime(last.endMinute)}
              </span>
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
