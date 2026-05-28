import { useMemo, useState } from "react";
import { useCreateGoogleSync, useGoogleCalendars, useGoogleSyncs } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "@/components/ui";

type VisibilityMode = "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";

export function GoogleCalendarSelectorSheet({ open, onClose, roomId }: { open: boolean; onClose: () => void; roomId: string }) {
  const calendars = useGoogleCalendars();
  const syncs = useGoogleSyncs(roomId);
  const createSync = useCreateGoogleSync(roomId);
  const [selected, setSelected] = useState<string | null>(null);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>("TITLE_MAPPED");
  const syncedIds = useMemo(() => new Set((syncs.data?.syncs ?? []).map((sync) => sync.googleCalendarId)), [syncs.data?.syncs]);

  function handleAdd() {
    if (!selected) return;
    createSync.mutate({ googleCalendarId: selected, visibilityMode }, { onSuccess: onClose });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="どのカレンダーを同期しますか"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="primary" disabled={!selected || createSync.isPending} onClick={handleAdd}>追加する</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">あなたの Google カレンダー</p>
          {calendars.isLoading ? <p className="text-sm font-bold text-fg-secondary">読み込み中...</p> : null}
          <div className="space-y-2">
            {(calendars.data?.calendars ?? []).map((calendar) => {
              const disabled = syncedIds.has(calendar.id);
              return (
                <label key={calendar.id} className={`flex items-center gap-3 rounded-2xl bg-bg-muted p-4 ${disabled ? "opacity-50" : ""}`}>
                  <input
                    type="radio"
                    checked={selected === calendar.id}
                    disabled={disabled}
                    onChange={() => setSelected(calendar.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-fg-primary">{calendar.summary}</span>
                    <span className="block truncate text-xs text-fg-secondary">{calendar.primary ? "primary" : calendar.timeZone}</span>
                  </span>
                  {disabled ? <span className="rounded-full bg-fg-primary/8 px-3 py-1 text-[11px] font-bold text-fg-secondary">同期中</span> : null}
                </label>
              );
            })}
          </div>
        </section>
        <section className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">表示モード</p>
          <VisibilityRadio value="TITLE_MAPPED" current={visibilityMode} onChange={setVisibilityMode} title="タイトルを伏せる" body="タイトルルールで正規化して表示します。" />
          <VisibilityRadio value="NORMAL" current={visibilityMode} onChange={setVisibilityMode} title="そのまま表示" body="Google の予定タイトルを表示します。" />
          <VisibilityRadio value="BUSY_ONLY" current={visibilityMode} onChange={setVisibilityMode} title="予定ありのみ" body="本人以外には時間枠だけ見せます。" />
        </section>
        {createSync.isError ? <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{createSync.error.message}</p> : null}
      </div>
    </BottomSheet>
  );
}

function VisibilityRadio({
  value,
  current,
  onChange,
  title,
  body,
}: {
  value: VisibilityMode;
  current: VisibilityMode;
  onChange: (value: VisibilityMode) => void;
  title: string;
  body: string;
}) {
  return (
    <label className="flex gap-3 rounded-2xl bg-bg-muted p-4">
      <input type="radio" className="mt-1" checked={current === value} onChange={() => onChange(value)} />
      <span>
        <span className="block text-sm font-black text-fg-primary">{title}</span>
        <span className="block text-xs leading-5 text-fg-secondary">{body}</span>
      </span>
    </label>
  );
}
