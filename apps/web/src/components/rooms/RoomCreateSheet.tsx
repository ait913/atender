import type { RoomDto } from "@atender/shared";
import { showToast } from "@/lib/toast";
import { useState } from "react";
import { useCreateRoom } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function RoomCreateSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (room: RoomDto) => void }) {
  const create = useCreateRoom();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="ルームを作成"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="primary" disabled={!name || create.isPending} onClick={() => create.mutate({ name, description: description || undefined }, { onSuccess: ({ room }) => { onClose(); onCreated?.(room); }, onError: () => showToast("保存できませんでした、もう一度試してください") })}>作成</Button>
        </div>
      }
    >
      <Field label="ルーム名" required><Input value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
      <Field label="説明"><Textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} /></Field>
    </BottomSheet>
  );
}
