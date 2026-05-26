import { useState } from "react";
import { useJoinRoom } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

function parseCode(value: string) {
  return value.trim().split("/").filter(Boolean).pop() ?? value.trim();
}

export function JoinByCodeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const join = useJoinRoom();
  const [code, setCode] = useState("");
  return (
    <BottomSheet open={open} onClose={onClose} title="リンクで参加">
      <Field label="招待リンクまたはコード"><Input value={code} onChange={(event) => setCode(event.currentTarget.value)} /></Field>
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button type="button" variant="primary" disabled={!code || join.isPending} onClick={() => join.mutate(parseCode(code), { onSuccess: onClose })}>参加</Button>
      </div>
    </BottomSheet>
  );
}
