import { useState } from "react";
import type { ReactNode } from "react";
import { useCreateFriendship, useFriendshipAction, useFriendships, useMe } from "@/api/hooks";
import { Button, EmptyState, ListSkeleton } from "@/components/ui";
import { AddFriendSheet } from "./AddFriendSheet";
import { FriendCard } from "./FriendCard";

export function Friends() {
  const me = useMe();
  const friendships = useFriendships();
  const accept = useFriendshipAction("accept");
  const decline = useFriendshipAction("decline");
  const cancel = useFriendshipAction("cancel");
  const remove = useFriendshipAction("delete");
  const block = useFriendshipAction("block");
  const [addOpen, setAddOpen] = useState(false);
  const rows = friendships.data?.friendships ?? [];
  const meId = me.data?.user.id;
  const received = rows.filter((item) => item.status === "PENDING" && item.receiver.id === meId);
  const sent = rows.filter((item) => item.status === "PENDING" && item.sender.id === meId);
  const accepted = rows.filter((item) => item.status === "ACCEPTED");
  const blocked = rows.filter((item) => item.status === "BLOCKED" && item.sender.id === meId);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">友達</h1>
        <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>友達を追加</Button>
      </div>
      {friendships.isLoading ? <ListSkeleton rows={3} /> : null}
      {rows.length === 0 && !friendships.isLoading ? <EmptyState title="まだ友達がいません">ハンドル検索または招待リンクで追加できます。</EmptyState> : null}
      <Section title={`受信した申請 (${received.length})`}>{received.map((item) => <FriendCard key={item.id} friendship={item} meId={meId} variant="received" onAccept={() => accept.mutate(item.id)} onDecline={() => decline.mutate(item.id)} />)}</Section>
      <Section title={`送信した申請 (${sent.length})`}>{sent.map((item) => <FriendCard key={item.id} friendship={item} meId={meId} variant="sent" onCancel={() => cancel.mutate(item.id)} />)}</Section>
      <Section title={`友達 (${accepted.length})`}>{accepted.map((item) => <FriendCard key={item.id} friendship={item} meId={meId} variant="accepted" onDelete={() => remove.mutate(item.id)} onBlock={() => block.mutate(item.id)} />)}</Section>
      {blocked.length ? <Section title={`ブロック中 (${blocked.length})`}>{blocked.map((item) => <FriendCard key={item.id} friendship={item} meId={meId} variant="blocked" onDelete={() => remove.mutate(item.id)} />)}</Section> : null}
      <AddFriendSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-fg-secondary">{title}</h2>
      {children}
    </section>
  );
}
