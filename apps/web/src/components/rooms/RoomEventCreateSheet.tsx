import dayjs from "dayjs";
import { useState } from "react";
import { useCreateRoomEvent } from "@/api/hooks";
import { RecurrencePicker, type RecurrenceValue } from "@/components/recurrence/RecurrencePicker";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";
import { Select } from "@/components/ui/Input";

export function RoomEventCreateSheet({ roomId, open, onClose, defaultDate }: { roomId?: string; open: boolean; onClose: () => void; defaultDate?: string }) {
  const create = useCreateRoomEvent(roomId);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(dayjs(defaultDate ?? undefined).format("YYYY-MM-DDTHH:mm"));
  const [end, setEnd] = useState(dayjs(defaultDate ?? undefined).add(1, "hour").format("YYYY-MM-DDTHH:mm"));
  const [recurrence, setRecurrence] = useState<RecurrenceValue>({ rrule: null });
  const [visibilityMode, setVisibilityMode] = useState<"NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY">("NORMAL");
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="予定を追加"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button
            type="button"
            variant="primary"
            disabled={!title}
            onClick={() => create.mutate({
              title,
              start: new Date(start).toISOString(),
              end: new Date(end).toISOString(),
              isAllDay: false,
              recurrence: recurrence.rrule ? { rrule: recurrence.rrule, exDates: [], rDates: [] } : undefined,
              visibilityMode,
            }, { onSuccess: onClose })}
          >
            保存
          </Button>
        </div>
      }
    >
      <Field label="タイトル" required><Input value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></Field>
      <Field label="開始"><Input type="datetime-local" value={start} onChange={(event) => setStart(event.currentTarget.value)} /></Field>
      <Field label="終了"><Input type="datetime-local" value={end} onChange={(event) => setEnd(event.currentTarget.value)} /></Field>
      <RecurrencePicker value={recurrence} onChange={setRecurrence} start={new Date(start)} />
      <Field label="表示モード">
        <Select value={visibilityMode} onChange={(event) => setVisibilityMode(event.currentTarget.value as typeof visibilityMode)}>
          <option value="NORMAL">通常</option>
          <option value="TITLE_MAPPED">タイトル隠す</option>
          <option value="BUSY_ONLY">予定ありのみ</option>
        </Select>
      </Field>
    </BottomSheet>
  );
}
