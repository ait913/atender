import { useEffect, useState } from "react";
import { APP_URL } from "@/api/client";
import { useCreateFriendship, useMe, useUserSearch } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

function parseInviteCode(value: string) {
  return value.trim().split("/").filter(Boolean).pop() ?? value.trim();
}

export function AddFriendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const create = useCreateFriendship();
  const [rawHandle, setRawHandle] = useState("");
  const [handle, setHandle] = useState("");
  const [invite, setInvite] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setHandle(rawHandle.replace(/^@/, "")), 300);
    return () => window.clearTimeout(id);
  }, [rawHandle]);
  const search = useUserSearch(handle);
  const myLink = `${APP_URL}/friends/add/${me.data?.user.inviteCode ?? ""}`;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="友達を追加"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>閉じる</Button>
          <Button type="button" variant="primary" disabled={!invite} onClick={() => create.mutate({ receiverInviteCode: parseInviteCode(invite) }, { onSuccess: onClose })}>追加</Button>
        </div>
      }
    >
      <Field label="ハンドル検索"><Input value={rawHandle} onChange={(event) => setRawHandle(event.currentTarget.value)} placeholder="@touri" /></Field>
      <div className="space-y-2">
        {(search.data?.users ?? []).map((user) => (
          <button key={user.id} type="button" className="flex w-full items-center justify-between rounded-md border border-border-subtle p-3 text-left" onClick={() => create.mutate({ receiverId: user.id })}>
            <span><span className="font-semibold">{user.name ?? "No name"}</span><span className="ml-2 text-sm text-fg-secondary">@{user.handle}</span></span>
            <span className="text-sm text-accent-700">申請</span>
          </button>
        ))}
      </div>
      <div className="border-t border-border-subtle pt-5">
        <p className="text-sm font-medium text-fg-secondary">招待リンクを送る</p>
        <div className="mt-2 rounded-md bg-bg-muted p-3 text-sm text-fg-secondary">{myLink}</div>
        <Button type="button" className="mt-2" onClick={() => navigator.clipboard?.writeText(myLink)}>リンクをコピー</Button>
      </div>
      <Field label="招待リンクで追加"><Input value={invite} onChange={(event) => setInvite(event.currentTarget.value)} /></Field>
    </BottomSheet>
  );
}
