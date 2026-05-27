import { useState } from "react";
import type { RoomEventDto } from "@atender/shared";
import { useDeleteRoomEvent, useUpdateRoomEvent } from "@/api/hooks";
import { RecurrenceEditDialog } from "@/components/recurrence/RecurrenceEditDialog";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";
import { recurrenceToText } from "@/lib/recurrenceFormat";

export function RoomEventDetailSheet({ roomId, event, open, onClose }: {
  roomId?: string;
  event?: RoomEventDto | null;
  open?: boolean;
  onClose?: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const update = useUpdateRoomEvent(roomId, event?.seriesId ?? event?.id);
  const remove = useDeleteRoomEvent(roomId, event?.seriesId ?? event?.id);
  if (!event) return null;
  const close = onClose ?? (() => undefined);
  const isRecurring = event.isRecurringOccurrence;
  return (
    <BottomSheet open={open ?? false} onClose={close} title={event.title}>
      {event.rawTitle && event.rawTitle !== event.title ? <p className="text-xs font-semibold text-fg-tertiary">元: {event.rawTitle}</p> : null}
      {isRecurring ? <p className="text-xs font-semibold text-fg-secondary">{recurrenceToText(event.recurrenceRule, new Date(event.start))}</p> : null}
      <Field label="タイトル"><Input value={title} onChange={(change) => setTitle(change.currentTarget.value)} /></Field>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => setDeleteOpen(true)}>削除</Button>
        <Button type="button" variant="primary" onClick={() => (isRecurring ? setEditOpen(true) : update.mutate({ title, editScope: "all" }, { onSuccess: close }))}>保存</Button>
      </div>
      <RecurrenceEditDialog
        open={editOpen}
        mode="edit"
        onClose={() => setEditOpen(false)}
        onConfirm={(scope) => update.mutate({ title, editScope: scope, originalDate: event.occurrenceDate }, { onSuccess: close })}
      />
      <RecurrenceEditDialog
        open={deleteOpen}
        mode="delete"
        onClose={() => setDeleteOpen(false)}
        onConfirm={(scope) => remove.mutate({ scope, originalDate: event.occurrenceDate }, { onSuccess: close })}
      />
    </BottomSheet>
  );
}
