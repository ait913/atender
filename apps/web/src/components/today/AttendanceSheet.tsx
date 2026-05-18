import { useEffect, useState } from "react";
import { ATTENDANCE_STATUS, type AttendanceStatus } from "@atender/shared";
import { useDeleteAttendance, usePatchAttendance } from "@/api/hooks";
import { statusLabels } from "@/components/attendance/StatusChip";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

export function AttendanceSheet({
  open,
  occurrenceId,
  currentStatus,
  onClose,
}: {
  open: boolean;
  occurrenceId: string | null;
  currentStatus: AttendanceStatus | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const patch = usePatchAttendance(undefined);
  const remove = useDeleteAttendance(undefined);

  useEffect(() => {
    if (open) setNote("");
  }, [open, occurrenceId]);

  function save(status: AttendanceStatus) {
    if (!occurrenceId) return;
    patch.mutate({ occurrenceId, input: { status, note: note || undefined } }, { onSuccess: onClose });
  }

  function clear() {
    if (!occurrenceId) return;
    remove.mutate(occurrenceId, { onSuccess: onClose });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="出欠を記録">
      <div className="space-y-5">
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {ATTENDANCE_STATUS.map((status) => (
              <Button key={status} variant={currentStatus === status ? "primary" : "secondary"} onClick={() => save(status)}>
                {statusLabels[status]}
              </Button>
            ))}
          </div>
          <Textarea placeholder="メモ" value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
        </section>
        <section className="space-y-4 pt-5 border-t border-border-subtle">
          <Button className="w-full" variant="ghost" onClick={clear}>記録を消す</Button>
        </section>
      </div>
    </BottomSheet>
  );
}
