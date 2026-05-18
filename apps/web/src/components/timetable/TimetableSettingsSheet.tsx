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
      <div className="space-y-5">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        <section className="space-y-4">
          <Field label="時限数" required>
            <NumberStepper value={slots.length} min={1} max={12} onChange={resize} disabled={bulk.isPending} />
          </Field>
        </section>
        <section className="space-y-4 pt-5 border-t border-border-subtle">
          {slots.map((slot, index) => (
            <div key={slot.periodIndex} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
              <Input value={slot.label} disabled={bulk.isPending} onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))} />
              <Input type="time" step={60} value={minutesToTime(slot.startMinute)} disabled={bulk.isPending} onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, startMinute: timeToMinutes(event.target.value) } : item)))} />
              <Input type="time" step={60} value={minutesToTime(slot.endMinute)} disabled={bulk.isPending} onChange={(event) => setSlots((current) => current.map((item, i) => (i === index ? { ...item, endMinute: timeToMinutes(event.target.value) } : item)))} />
            </div>
          ))}
        </section>
        <footer className="sticky bottom-0 -mx-5 px-5 py-3 border-t border-border-subtle bg-bg-elevated" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          <div className="flex gap-3">
            <Button className="flex-1" variant="secondary" disabled={bulk.isPending} onClick={() => resize(5)}>標準時刻に戻す</Button>
            <Button
              className="flex-1"
              disabled={bulk.isPending || !userTimetable || slots.length === 0}
              onClick={() => {
                setError(null);
                if (!userTimetable) {
                  setError("時間割が選択されていません");
                  return;
                }
                if (slots.length === 0) {
                  setError("時限数を 1 以上にしてください");
                  return;
                }
                bulk.mutate(
                  { daySlots: slots },
                  {
                    onSuccess: onClose,
                    onError: (err) => {
                      if (err instanceof ApiError) {
                        if (err.status === 409 && err.code === "CONFLICT") {
                          setError("時限数を超える授業があります。先に該当の授業を削除してください");
                        } else if (err.status === 400) {
                          setError(`入力に誤り: ${err.message}`);
                        } else {
                          setError(`保存できませんでした (${err.status}): ${err.message}`);
                        }
                      } else {
                        setError("保存できませんでした (通信エラー)");
                      }
                      console.error("[TimetableSettings] save error", err);
                    },
                  },
                );
              }}
            >
              {bulk.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </footer>
      </div>
    </BottomSheet>
  );
}
