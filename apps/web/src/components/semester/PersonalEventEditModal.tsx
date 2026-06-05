import { useEffect, useState } from "react";
import type { PersonalEventDto } from "@atender/shared";
import { useCreatePersonalEvent, useUpdatePersonalEvent } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Textarea } from "@/components/ui";

const colors = ["#10b981", "#60a5fa", "#f472b6", "#8b5cf6", "#f59e0b"];

type Props = {
  open: boolean;
  onClose: () => void;
  date: string;
  event?: PersonalEventDto | null;
  semesterId?: string | null;
  onSaved?: (event: PersonalEventDto) => void;
};

export function PersonalEventEditModal({ open, onClose, date, event, semesterId, onSaved }: Props) {
  const createEvent = useCreatePersonalEvent(date);
  const updateEvent = useUpdatePersonalEvent(event?.id, event?.date ?? date);
  const [form, setForm] = useState({
    title: "",
    date,
    isAllDay: true,
    startTime: "09:00",
    endTime: "10:00",
    color: colors[0]!,
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: event?.title ?? "",
      date: event?.date ?? date,
      isAllDay: event?.isAllDay ?? true,
      startTime: minuteToTime(event?.startMinute ?? 540),
      endTime: minuteToTime(event?.endMinute ?? 600),
      color: event?.color ?? colors[0]!,
      note: event?.note ?? "",
    });
  }, [date, event, open]);

  const isPending = createEvent.isPending || updateEvent.isPending;
  const canSave = form.title.trim().length > 0 && form.date.length > 0 && !isPending;

  async function handleSave() {
    if (!canSave) return;
    const body = {
      semesterId: semesterId ?? undefined,
      date: form.date,
      title: form.title.trim(),
      isAllDay: form.isAllDay,
      startMinute: form.isAllDay ? null : timeToMinute(form.startTime),
      endMinute: form.isAllDay ? null : timeToMinute(form.endTime),
      color: form.color,
      note: form.note.trim() || undefined,
    };
    const result = event
      ? await updateEvent.mutateAsync(body)
      : await createEvent.mutateAsync(body);
    onSaved?.(result.event);
    onClose();
  }

  const error = createEvent.error ?? updateEvent.error;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={event ? "予定を編集" : "予定を追加"}
      stackLevel={2}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="primary" disabled={!canSave} onClick={() => void handleSave()}>保存</Button>
        </div>
      }
    >
      <Field label="タイトル" required>
        <Input value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} />
      </Field>
      <Field label="日付" required>
        <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.currentTarget.value })} />
      </Field>
      <label className="flex min-h-12 items-center justify-between rounded-2xl bg-bg-muted px-4 text-sm font-bold">
        <span>終日</span>
        <input
          type="checkbox"
          checked={form.isAllDay}
          onChange={(e) => setForm({ ...form, isAllDay: e.currentTarget.checked })}
          className="h-5 w-5 accent-accent-500"
        />
      </label>
      {!form.isAllDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始時刻">
            <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.currentTarget.value })} />
          </Field>
          <Field label="終了時刻">
            <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.currentTarget.value })} />
          </Field>
        </div>
      ) : null}
      <Field label="色">
        <div className="flex flex-wrap items-center gap-2">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`色 ${color}`}
              onClick={() => setForm({ ...form, color })}
              className={`h-10 w-10 rounded-full transition active:scale-95 ${form.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-bg-elevated" : ""}`}
              style={{ background: color }}
            />
          ))}
          <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.currentTarget.value })} className="h-10 w-16 p-1" />
        </div>
      </Field>
      <Field label="メモ">
        <Textarea value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} />
      </Field>
      {error ? <p className="rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{error.message}</p> : null}
    </BottomSheet>
  );
}

function minuteToTime(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToMinute(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}
