import { useEffect, useState } from "react";
import type { PersonalEventOccurrenceDto, RecurrenceSpec } from "@atender/shared";
import { useCreatePersonalEvent, useUpdatePersonalEvent } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { RecurrenceSpecPicker } from "@/components/recurrence/RecurrenceSpecPicker";
import { RecurrenceEditDialog } from "@/components/recurrence/RecurrenceEditDialog";
import { Button, Field, Input, Textarea } from "@/components/ui";
import {
  fromDateTimeLocal,
  inclusiveEndDate,
  jstDayStartIso,
  jstNextDayStartIso,
  toDateTimeLocal,
} from "@/lib/personalEventDays";

const colors = ["#12B172", "#56D8C3", "#568CFC", "#A978FA", "#FC6ABF", "#FD728E"];

type Props = {
  open: boolean;
  onClose: () => void;
  date: string;
  event?: PersonalEventOccurrenceDto | null;
  onSaved?: () => void;
};

export function PersonalEventEditModal({ open, onClose, date, event, onSaved }: Props) {
  const createEvent = useCreatePersonalEvent(date);
  const updateEvent = useUpdatePersonalEvent(event?.seriesId, date);
  const [scopePrompt, setScopePrompt] = useState(false);
  const [form, setForm] = useState({
    title: "",
    isAllDay: true,
    startDate: date,
    endDate: date,
    startAt: `${date}T09:00`,
    endAt: `${date}T10:00`,
    location: "",
    color: colors[0]!,
    note: "",
  });
  const [spec, setSpec] = useState<RecurrenceSpec | null>(null);
  const [originalSpec, setOriginalSpec] = useState<RecurrenceSpec | null>(null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setForm({
        title: event.title,
        isAllDay: event.isAllDay,
        startDate: event.days[0]?.date ?? date,
        endDate: event.isAllDay ? inclusiveEndDate(event.end) : (event.days[event.days.length - 1]?.date ?? date),
        startAt: toDateTimeLocal(event.start),
        endAt: toDateTimeLocal(event.end),
        location: event.location ?? "",
        color: event.color ?? colors[0]!,
        note: event.note ?? "",
      });
      setSpec(event.recurrenceSpec);
      setOriginalSpec(event.recurrenceSpec);
    } else {
      setForm({
        title: "",
        isAllDay: true,
        startDate: date,
        endDate: date,
        startAt: `${date}T09:00`,
        endAt: `${date}T10:00`,
        location: "",
        color: colors[0]!,
        note: "",
      });
      setSpec(null);
      setOriginalSpec(null);
    }
  }, [date, event, open]);

  const isPending = createEvent.isPending || updateEvent.isPending;
  const timingValid = form.isAllDay ? form.endDate >= form.startDate : form.endAt > form.startAt;
  const canSave = form.title.trim().length > 0 ? (!isPending ? timingValid : false) : false;
  const specChanged = JSON.stringify(spec) !== JSON.stringify(originalSpec);
  const startForPicker = new Date(form.isAllDay ? jstDayStartIso(form.startDate) : fromDateTimeLocal(form.startAt));

  function wireTiming() {
    if (form.isAllDay) {
      return { start: jstDayStartIso(form.startDate), end: jstNextDayStartIso(form.endDate) };
    }
    return { start: fromDateTimeLocal(form.startAt), end: fromDateTimeLocal(form.endAt) };
  }

  function recurrencePatch(scope: "single" | "future" | "all") {
    if (scope !== "all") return {};
    if (!specChanged) return {};
    if (spec) return { recurrence: { spec, exDates: [], rDates: [] } };
    return { clearRecurrence: true };
  }

  async function commit(scope: "single" | "future" | "all") {
    const timing = wireTiming();
    const shared = {
      title: form.title.trim(),
      start: timing.start,
      end: timing.end,
      isAllDay: form.isAllDay,
      location: form.location.trim() || null,
      note: form.note.trim() || null,
      color: form.color,
    };
    if (event) {
      await updateEvent.mutateAsync({
        ...shared,
        editScope: scope,
        originalDate: event.occurrenceDate,
        ...recurrencePatch(scope),
      });
    } else {
      await createEvent.mutateAsync({
        ...shared,
        ...(spec ? { recurrence: { spec, exDates: [], rDates: [] } } : {}),
      });
    }
    onSaved?.();
    onClose();
  }

  function handleSave() {
    if (!canSave) return;
    if (event?.isRecurringOccurrence) {
      setScopePrompt(true);
      return;
    }
    void commit("all");
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
          <Button type="button" variant="primary" disabled={!canSave} onClick={handleSave}>保存</Button>
        </div>
      }
    >
      <Field label="タイトル" required>
        <Input value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} />
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
      {form.isAllDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始日" required>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })} />
          </Field>
          <Field label="終了日" required>
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始" required>
            <Input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.currentTarget.value })} />
          </Field>
          <Field label="終了" required>
            <Input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.currentTarget.value })} />
          </Field>
        </div>
      )}
      <RecurrenceSpecPicker value={spec} onChange={setSpec} start={startForPicker} />
      <Field label="場所">
        <Input value={form.location} maxLength={200} onChange={(e) => setForm({ ...form, location: e.currentTarget.value })} />
      </Field>
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
      <RecurrenceEditDialog
        open={scopePrompt}
        mode="edit"
        onClose={() => setScopePrompt(false)}
        onConfirm={(scope) => {
          setScopePrompt(false);
          void commit(scope);
        }}
      />
    </BottomSheet>
  );
}
