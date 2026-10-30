import { useEffect, useRef, useState } from "react";
import { useJoinRoom } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";
import * as RoomTimetableLogic from "@/lib/RoomTimetableLogic";

export function JoinByCodeSheet({ open, onClose, initialCode, onJoined }: { open: boolean; onClose: () => void; initialCode?: string; onJoined?: (roomId: string) => void }) {
  const join = useJoinRoom();
  const [code, setCode] = useState("");
  const autoJoined = useRef(false);
  const { mutate } = join;
  useEffect(() => {
    if (!open) { autoJoined.current = false; return; }
    if (initialCode === undefined || autoJoined.current) return;
    autoJoined.current = true;
    setCode(initialCode);
    mutate(RoomTimetableLogic.parseInviteCode(initialCode), {
      onSuccess: ({ room }) => { onClose(); onJoined?.(room.id); },
    });
  }, [open, initialCode, mutate, onClose, onJoined]);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="リンクで参加"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="primary" disabled={!code || join.isPending} onClick={() => join.mutate(RoomTimetableLogic.parseInviteCode(code), { onSuccess: ({ room }) => { onClose(); onJoined?.(room.id); } })}>参加</Button>
        </div>
      }
    >
      <Field label="招待リンクまたはコード"><Input value={code} onChange={(event) => setCode(event.currentTarget.value)} /></Field>
      {join.error ? <p className="text-sm text-status-absent">{join.error.message}</p> : null}
    </BottomSheet>
  );
}
