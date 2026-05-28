import { useState } from "react";
import { useUnlinkGoogleCalendar } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button } from "@/components/ui";

export function GoogleCalendarConnectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const unlink = useUnlinkGoogleCalendar();
  const [deleteEvents, setDeleteEvents] = useState(true);

  function handleUnlink() {
    unlink.mutate({ deleteEvents }, { onSuccess: onClose });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Google Calendar の連携を解除"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="destructive" disabled={unlink.isPending} onClick={handleUnlink}>解除する</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-fg-secondary">解除すると以降の同期が止まります。</p>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">取り込んだ予定の扱い</p>
          <label className="flex gap-3 rounded-2xl bg-bg-muted p-4">
            <input type="radio" className="mt-1" checked={deleteEvents} onChange={() => setDeleteEvents(true)} />
            <span>
              <span className="block text-sm font-black text-fg-primary">取り込んだ予定も削除する</span>
              <span className="block text-xs leading-5 text-fg-secondary">ルーム上の Google 由来予定を削除します。</span>
            </span>
          </label>
          <label className="flex gap-3 rounded-2xl bg-bg-muted p-4">
            <input type="radio" className="mt-1" checked={!deleteEvents} onChange={() => setDeleteEvents(false)} />
            <span>
              <span className="block text-sm font-black text-fg-primary">ルームに残す</span>
              <span className="block text-xs leading-5 text-fg-secondary">解除後も表示されますが、Google 側の変更は反映されません。</span>
            </span>
          </label>
        </div>
        {unlink.isError ? <p className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{unlink.error.message}</p> : null}
      </div>
    </BottomSheet>
  );
}
