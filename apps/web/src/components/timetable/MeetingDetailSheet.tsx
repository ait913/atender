import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { MeetingDto, UserTimetableDto } from "@atender/shared";
import { useDeleteMeeting, useUpdateMeeting } from "@/api/hooks";
import { ConfirmDialog } from "@/components/sheet/ConfirmDialog";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "@/components/ui";
import { minutesToTime } from "@/lib/dayjs";
import { MeetingEditForm } from "./MeetingEditForm";

export function MeetingDetailSheet({ open, onClose, userTimetable, meeting }: { open: boolean; onClose: () => void; userTimetable: UserTimetableDto | null; meeting: MeetingDto | null }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateMeeting(meeting?.id, userTimetable?.id, userTimetable?.semesterId);
  const remove = useDeleteMeeting(meeting?.id, userTimetable?.id, userTimetable?.semesterId);
  const pending = update.isPending || remove.isPending;

  if (!userTimetable || !meeting) return null;
  const course = userTimetable.courses.find((item) => item.id === meeting.courseId);
  const start = userTimetable.daySlots.find((slot) => slot.periodIndex === meeting.startPeriodIndex);
  const end = userTimetable.daySlots.find((slot) => slot.periodIndex === meeting.startPeriodIndex + meeting.periodCount - 1) ?? start;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={editing ? "授業を編集" : "授業詳細"} closeDisabled={pending}>
        {error ? <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        {editing ? (
          <MeetingEditForm
            userTimetable={userTimetable}
            initial={meeting}
            submitting={pending}
            onSubmit={(value) => {
              setError(null);
              update.mutate(value, { onSuccess: () => { setEditing(false); onClose(); }, onError: () => setError("保存できませんでした") });
            }}
          />
        ) : (
          <div className="space-y-5">
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">{course?.name ?? "授業"}</h2>
              <p className="mt-1 text-sm text-fg-secondary">{course?.teacher ?? "-"} / {course?.room ?? "-"}</p>
              {start && end ? <p className="mt-2 text-sm text-fg-secondary">{minutesToTime(start.startMinute)} - {minutesToTime(end.endMinute)}</p> : null}
            </section>
            <footer className="sticky bottom-0 -mx-5 px-5 py-3 border-t border-border-subtle bg-bg-elevated" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
              <div className="flex gap-3">
                <Button className="flex-1" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>編集</Button>
              </div>
            </footer>
            <section className="space-y-4 pt-5 border-t border-border-subtle">
              <Button className="w-full" variant="destructive" disabled={pending} onClick={() => setConfirm(true)} icon={pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : undefined}>削除</Button>
            </section>
          </div>
        )}
      </BottomSheet>
      <ConfirmDialog
        open={confirm}
        title="このコマを削除しますか?"
        description="関連の出欠記録も削除されます"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setError(null);
          remove.mutate(undefined, { onSuccess: () => { setConfirm(false); onClose(); }, onError: () => { setConfirm(false); setError("削除できませんでした"); } });
        }}
      />
    </>
  );
}
