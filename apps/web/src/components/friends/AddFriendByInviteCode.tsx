import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCreateFriendship } from "@/api/hooks";
import { Button, Panel } from "@/components/ui";

export function AddFriendByInviteCode() {
  const { inviteCode } = useParams({ from: "/friends/add/$inviteCode" });
  const navigate = useNavigate();
  const create = useCreateFriendship();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    create.mutate({ receiverInviteCode: inviteCode }, {
      onSuccess: () => void navigate({ to: "/friends", replace: true }),
      onError: (err) => setError(err instanceof Error ? err.message : "申請できませんでした"),
    });
  }, [inviteCode]);
  return <Panel>{error ?? "友達申請を送信しています..."} {error ? <Button type="button" onClick={() => void navigate({ to: "/friends" })}>友達へ戻る</Button> : null}</Panel>;
}
