import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useRooms } from "@/api/hooks";
import { Button, EmptyState, ListSkeleton } from "@/components/ui";
import { JoinByCodeSheet } from "./JoinByCodeSheet";
import { RoomCard } from "./RoomCard";
import { RoomCreateSheet } from "./RoomCreateSheet";

export function Rooms() {
  const navigate = useNavigate();
  const rooms = useRooms();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const list = rooms.data?.rooms ?? [];
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold">ルーム</h1>
          <div className="flex gap-3">
            <Button type="button" onClick={() => setJoinOpen(true)}>リンクで参加</Button>
            <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>作成</Button>
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" className="text-xs text-fg-tertiary hover:text-fg-secondary" onClick={() => void navigate({ to: "/templates" })}>
            みんなの時間割
          </button>
        </div>
      </div>
      {rooms.isLoading ? (
        <ListSkeleton rows={3} />
      ) : list.length === 0 ? (
        <EmptyState title="まだルームに参加していません" action={<Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>ルームを作成</Button>}>友達の時間割と予定をまとめて見られます。</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{list.map((room) => <RoomCard key={room.id} room={room} onClick={() => void navigate({ to: "/rooms/$id", params: { id: room.id } })} />)}</div>
      )}
      <RoomCreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinByCodeSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
