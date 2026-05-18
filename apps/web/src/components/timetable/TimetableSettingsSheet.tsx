import { useEffect, useState } from "react";
import type { DaySlotDto, UserTimetableDto } from "@atender/shared";
import { useBulkReplaceDaySlots } from "@/api/hooks";
import { ApiError } from "@/api/client";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, NumberStepper } from "@/components/ui";
import { minutesToTime, timeToMinutes } from "@/lib/dayjs";
import { defaultDaySlots } from "./helpers";

export function TimetableSettingsSheet({ open, onClose, userTimetable }: { open: boolean; onClose: () => void; userTimetable: UserTimetableDto | null }) {
  const [slots, setSlots] = useState<DaySlotDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bulk = useBulkReplaceDaySlots(userTimetable?.id, userTimetable?.semesterId);

  useEffect(() => {
    if (open && userTimetable) setSlots([...userTimetable.daySlots].sort((a, b) => a.periodIndex - b.periodIndex));
  }, [open, userTimetable]);

  function resize(count: number) {
    if (!userTimetable) return;
    const defaults = defaultDaySlots(count);
    setSlots(defaults.map((slot, index) => slots[index] ?? slot));
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="時間割設定" closeDisabled={bulk.isPending}>
      <div className="grid gap-4">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        <Field label="時限数">
          <NumberStepper value={slots.length} min={1} max={12} onChange={resize} disabled={bulk.isPending} />
        </Field>
        <div className="grid gap-3">
          {slots.map((slot, index) => (
            <div key={slot.periodIndex} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
              <Input value={slot.label} disabled={bulk.isPending} onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))} />
              <Input type="time" step={60} value={minutesToTime(slot.startMinute)} disabled={bulk.isPending} onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, startMinute: timeToMinutes(event.target.value) } : item)))} />
              <Input type="time" step={60} value={minutesToTime(slot.endMinute)} disabled={bulk.isPending} onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, endMinute: timeToMinutes(event.target.value) } : item)))} />
            </div>
          ))}
        </div>
        <Button variant="secondary" disabled={bulk.isPending} onClick={() => resize(5)}>標準時刻に戻す</Button>
        <Button
          disabled={bulk.isPending}
          onClick={() => {
            setError(null);
            bulk.mutate(
              { daySlots: slots },
              {
                onSuccess: onClose,
                onError: (err) => setError(err instanceof ApiError && err.status === 409 ? "6 限以降の授業を削除してから減らしてください" : "保存できませんでした"),
              },
            );
          }}
        >
          {bulk.isPending ? "保存中..." : "保存"}
        </Button>
      </div>
    </BottomSheet>
  );
}
