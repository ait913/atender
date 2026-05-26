import dayjs from "dayjs";
import { useState } from "react";
import { useCreateRoomEvent } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function RoomEventCreateSheet({ roomId, open, onClose }: { roomId?: string; open: boolean; onClose: () => void }) {
  const create = useCreateRoomEvent(roomId);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(dayjs().format("YYYY-MM-DDTHH:mm"));
  const [end, setEnd] = useState(dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm"));
  return (
    <BottomSheet open={open} onClose={onClose} title="予定を追加">
      <Field label="タイトル" required><Input value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></Field>
      <Field label="開始"><Input type="datetime-local" value={start} onChange={(event) => setStart(event.currentTarget.value)} /></Field>
      <Field label="終了"><Input type="datetime-local" value={end} onChange={(event) => setEnd(event.currentTarget.value)} /></Field>
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button type="button" variant="primary" disabled={!title} onClick={() => create.mutate({ title, start: new Date(start).toISOString(), end: new Date(end).toISOString(), isAllDay: false }, { onSuccess: onClose })}>保存</Button>
      </div>
    </BottomSheet>
  );
}
