import { useEffect, useMemo, useState } from "react";
import type { UserTimetableDto } from "@atender/shared";
import { usePatchUserTimetable, usePublishTimetable, useSemesters } from "@/api/hooks";
import { Button, Field, Input, Toggle } from "@/components/ui";
import { BottomSheet } from "./BottomSheet";

type SlotInput = { periodIndex: number; label: string; startMinute: number; endMinute: number; isBreak: boolean };

function minutesToHHMM(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function hhmmToMinutes(s: string) {
  const [h, mm] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (mm ?? 0);
}

export function TimetableSettingsSheet({
  open,
  onClose,
  timetable,
}: {
  open: boolean;
  onClose: () => void;
  timetable: UserTimetableDto | null;
}) {
  const patch = usePatchUserTimetable(timetable?.id);
  const publish = usePublishTimetable(timetable?.id);
  const semesters = useSemesters();
  const semester = useMemo(() => semesters.data?.semesters.find((s) => s.id === timetable?.semesterId) ?? null, [semesters.data, timetable?.semesterId]);
  const [name, setName] = useState("");
  const [publishEnabled, setPublishEnabled] = useState(true);
  const [publishTitle, setPublishTitle] = useState("");
  const [slots, setSlots] = useState<SlotInput[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(timetable?.title ?? "");
    setPublishEnabled(true);
    setPublishTitle(semester?.name ?? timetable?.title ?? "");
    setSlots(timetable?.daySlots.map((s) => ({ ...s })) ?? []);
    setMessage(null);
  }, [open, timetable?.title, timetable?.daySlots, semester?.name]);

  function addSlot() {
    setSlots((cur) => {
      const next = cur.length + 1;
      const lastEnd = cur[cur.length - 1]?.endMinute ?? 540;
      return [
        ...cur,
        { periodIndex: next, label: `${next}限`, startMinute: lastEnd + 10, endMinute: lastEnd + 100, isBreak: false },
      ];
    });
  }

  function removeSlot(index: number) {
    setSlots((cur) => cur.filter((_, i) => i !== index).map((s, i) => ({ ...s, periodIndex: i + 1 })));
  }

  function updateSlot(index: number, patch: Partial<SlotInput>) {
    setSlots((cur) => cur.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleSave() {
    if (!timetable) return;
    const trimmedName = name.trim();
    const trimmedPublishTitle = publishTitle.trim();

    // validate slots: end > start, no overlap
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      if (s.endMinute <= s.startMinute) {
        setMessage(`${i + 1} 限目: 終了時刻は開始時刻より後にしてください`);
        return;
      }
    }

    const patches: Promise<unknown>[] = [];
    if (trimmedName.length > 0 && trimmedName !== timetable.title) {
      patches.push(patch.mutateAsync({ title: trimmedName }));
    }
    const slotsChanged = JSON.stringify(slots) !== JSON.stringify(timetable.daySlots);
    if (slotsChanged) {
      patches.push(patch.mutateAsync({ daySlots: slots }));
    }
    await Promise.all(patches);

    if (publishEnabled) {
      if (trimmedPublishTitle.length === 0) {
        setMessage("公開タイトルを入力してください");
        return;
      }
      await publish.mutateAsync({ title: trimmedPublishTitle });
    }
    onClose();
  }

  function handleCancel() {
    setName(timetable?.title ?? "");
    setPublishEnabled(true);
    setPublishTitle(semester?.name ?? timetable?.title ?? "");
    setSlots(timetable?.daySlots.map((s) => ({ ...s })) ?? []);
    setMessage(null);
    onClose();
  }

  const disabled = !timetable || patch.isPending || publish.isPending;

  return (
    <BottomSheet open={open} onClose={handleCancel} title="時間割の設定">
      {!timetable ? (
        <p className="rounded-2xl bg-white/6 p-4 text-sm text-fg-secondary">先に学期を作成してください。</p>
      ) : null}
      <Field label="名前">
        <Input value={name} disabled={!timetable} onChange={(event) => setName(event.currentTarget.value)} />
      </Field>

      <div className="space-y-3 border-t border-white/8 pt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">時限 ({slots.length} 限)</span>
          <button
            type="button"
            onClick={addSlot}
            disabled={!timetable}
            className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-bold text-fg-primary transition active:scale-95 hover:bg-white/14 disabled:opacity-40"
          >
            + コマを追加
          </button>
        </div>
        {slots.length === 0 ? (
          <p className="rounded-2xl bg-white/4 px-4 py-3 text-xs text-fg-tertiary">コマを追加してください</p>
        ) : (
          <ul className="space-y-2">
            {slots.map((slot, i) => (
              <li key={i} className="flex items-center gap-2 rounded-2xl bg-white/4 p-3">
                <input
                  type="text"
                  value={slot.label}
                  onChange={(e) => updateSlot(i, { label: e.currentTarget.value })}
                  className="w-14 rounded-xl bg-white/6 px-2 py-2 text-sm font-bold text-fg-primary outline-none focus:bg-white/10"
                  aria-label={`${slot.periodIndex}限ラベル`}
                />
                <input
                  type="time"
                  value={minutesToHHMM(slot.startMinute)}
                  onChange={(e) => updateSlot(i, { startMinute: hhmmToMinutes(e.currentTarget.value) })}
                  className="flex-1 rounded-xl bg-white/6 px-2 py-2 text-sm text-fg-primary outline-none focus:bg-white/10"
                  aria-label="開始時刻"
                />
                <span className="text-fg-tertiary">–</span>
                <input
                  type="time"
                  value={minutesToHHMM(slot.endMinute)}
                  onChange={(e) => updateSlot(i, { endMinute: hhmmToMinutes(e.currentTarget.value) })}
                  className="flex-1 rounded-xl bg-white/6 px-2 py-2 text-sm text-fg-primary outline-none focus:bg-white/10"
                  aria-label="終了時刻"
                />
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white/6 text-fg-secondary transition active:scale-95 hover:bg-status-absent/20 hover:text-status-absent"
                  aria-label={`${slot.periodIndex}限を削除`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-white/8 pt-5">
        <Toggle checked={publishEnabled} disabled={!timetable} onChange={setPublishEnabled} label="みんなの時間割で公開" />
        {publishEnabled ? (
          <div className="mt-5">
            <Field label="公開タイトル">
              <Input value={publishTitle} disabled={!timetable} onChange={(event) => setPublishTitle(event.currentTarget.value)} />
            </Field>
          </div>
        ) : null}
      </div>
      {message ? <p className="rounded-2xl bg-status-tardy/15 px-4 py-3 text-sm font-bold text-status-tardy">{message}</p> : null}
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={handleCancel}>キャンセル</Button>
        <Button type="button" variant="primary" disabled={disabled} onClick={() => void handleSave()}>保存</Button>
      </div>
    </BottomSheet>
  );
}
