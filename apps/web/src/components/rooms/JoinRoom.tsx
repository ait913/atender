import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useJoinRoom } from "@/api/hooks";
import { Button, Panel } from "@/components/ui";

export function JoinRoom() {
  const { inviteCode } = useParams({ from: "/rooms/join/$inviteCode" });
  const navigate = useNavigate();
  const join = useJoinRoom();
  useEffect(() => {
    join.mutate(inviteCode, { onSuccess: (data) => navigate({ to: "/rooms/$id", params: { id: data.room.id }, replace: true }) });
  }, [inviteCode]);
  return (
    <Panel>
      <p className="font-semibold">{join.isError ? "招待リンクが無効です" : "ルームに参加しています"}</p>
      {join.isError ? <Button type="button" className="mt-3" onClick={() => navigate({ to: "/rooms" })}>ルームへ戻る</Button> : null}
    </Panel>
  );
}
