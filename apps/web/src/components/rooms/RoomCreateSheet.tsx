import { useState } from "react";
import { useCreateRoom } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function RoomCreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateRoom();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <BottomSheet open={open} onClose={onClose} title="ルームを作成">
      <Field label="ルーム名" required><Input value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
      <Field label="説明"><Textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} /></Field>
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button type="button" variant="primary" disabled={!name || create.isPending} onClick={() => create.mutate({ name, description: description || undefined }, { onSuccess: onClose })}>作成</Button>
      </div>
    </BottomSheet>
  );
}
