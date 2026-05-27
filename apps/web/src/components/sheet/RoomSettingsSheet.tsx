import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { APP_URL } from "@/api/client";
import { useMe, useRegenerateRoomInvite, useRemoveRoomMember, useRoom, useRoomAction, useRoomMembers, useUpdateRoom } from "@/api/hooks";
import { memberColor } from "@/lib/memberColor";
import { Button, ConfirmDialog, Field, Input, Textarea, Toggle } from "@/components/ui";
import { BottomSheet } from "./BottomSheet";

export function RoomSettingsSheet({ roomId, open, onClose }: { roomId: string; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const me = useMe();
  const room = useRoom(roomId);
  const members = useRoomMembers(roomId);
  const update = useUpdateRoom(roomId);
  const regenerate = useRegenerateRoomInvite(roomId);
  const removeMember = useRemoveRoomMember(roomId);
  const leave = useRoomAction(roomId, "leave");
  const del = useRoomAction(roomId, "delete");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showMemberTimetables, setShowMemberTimetables] = useState(true);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const myMembership = useMemo(
    () => members.data?.members.find((member) => member.userId === me.data?.user.id),
    [members.data?.members, me.data?.user.id],
  );
  const isOwner = myMembership?.role === "OWNER";

  useEffect(() => {
    if (!room.data?.room) return;
    setName(room.data.room.name);
    setDescription(room.data.room.description ?? "");
    setShowMemberTimetables(room.data.room.showMemberTimetables);
  }, [room.data?.room]);

  async function persist(patch: { name?: string; description?: string | null; showMemberTimetables?: boolean }) {
    if (!isOwner) return;
    await update.mutateAsync(patch);
  }

  async function handleCopyInvite() {
    await navigator.clipboard?.writeText(`${APP_URL}/rooms/join/${room.data?.room.inviteCode ?? ""}`);
    setCopyMessage("コピーしました");
  }

  async function handleLeave() {
    await leave.mutateAsync();
    onClose();
    await navigate({ to: "/rooms" });
  }

  async function handleDelete() {
    await del.mutateAsync();
    onClose();
    await navigate({ to: "/rooms" });
  }

  const pendingMember = members.data?.members.find((member) => member.userId === pendingRemove);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="ルームの設定"
      footer={
        isOwner ? (
          <Button type="button" variant="destructive" className="w-full" onClick={() => setPendingDelete(true)}>ルームを削除</Button>
        ) : (
          <Button type="button" variant="ghost" className="w-full" onClick={() => setPendingLeave(true)}>退出する</Button>
        )
      }
    >
      <Field label="ルーム名">
        <Input
          value={name}
          disabled={!isOwner}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={() => {
            if (name !== room.data?.room.name) void persist({ name });
          }}
        />
      </Field>
      <Field label="ルームの説明">
        <Textarea
          value={description}
          disabled={!isOwner}
          onChange={(event) => setDescription(event.currentTarget.value)}
          onBlur={() => {
            if (description !== (room.data?.room.description ?? "")) void persist({ description: description || null });
          }}
        />
      </Field>
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">メンバーの時間割をカレンダーに反映</p>
        <Toggle
          checked={showMemberTimetables}
          disabled={!isOwner}
          onChange={(next) => {
            setShowMemberTimetables(next);
            void persist({ showMemberTimetables: next });
          }}
          label="反映する"
        />
      </div>
      <section className="border-t border-white/8 pt-5">
        <h3 className="mb-3 text-sm font-black text-fg-primary">メンバー ({members.data?.members.length ?? 0})</h3>
        <ul className="space-y-2">
          {(members.data?.members ?? []).map((member) => (
            <li key={member.userId} className="flex items-center gap-3 rounded-2xl bg-white/4 p-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-full text-xs font-black text-white"
                style={{ background: memberColor(member.userId) }}
                aria-hidden
              >
                {(member.name ?? member.handle ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-fg-primary">{member.name ?? member.handle ?? "No name"}</p>
                <p className="truncate text-xs text-fg-tertiary">{member.role === "OWNER" ? "オーナー" : "メンバー"}</p>
              </div>
              {isOwner && member.userId !== me.data?.user.id && member.role !== "OWNER" ? (
                <button
                  type="button"
                  aria-label={`${member.name ?? "メンバー"} を追放`}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-status-absent transition hover:bg-status-absent/20 active:scale-95"
                  onClick={() => setPendingRemove(member.userId)}
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {isOwner ? (
        <section className="space-y-3 border-t border-white/8 pt-5">
          <h3 className="text-sm font-black text-fg-primary">招待リンク</h3>
          <p className="break-all rounded-2xl bg-white/4 p-3 text-xs text-fg-secondary">
            {APP_URL}/rooms/join/{room.data?.room.inviteCode ?? ""}
          </p>
          {copyMessage ? <p className="text-xs font-bold text-accent-500">{copyMessage}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleCopyInvite()}>リンクをコピー</Button>
            <Button type="button" variant="ghost" onClick={() => regenerate.mutate()}>再発行</Button>
          </div>
        </section>
      ) : null}
      <ConfirmDialog
        open={pendingRemove != null}
        title="メンバーを追放しますか？"
        body="このメンバーはルームから外され、再度招待しない限り戻れません。"
        confirmLabel="追放する"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (pendingRemove) removeMember.mutate(pendingRemove);
          setPendingRemove(null);
        }}
      />
      <ConfirmDialog
        open={pendingLeave}
        title="ルームを退出しますか？"
        body="退出すると、再度招待されるまでこのルームに戻れません。"
        confirmLabel="退出する"
        onCancel={() => setPendingLeave(false)}
        onConfirm={() => {
          setPendingLeave(false);
          void handleLeave();
        }}
      />
      <ConfirmDialog
        open={pendingDelete}
        title="ルームを削除しますか？"
        body="ルームと予定は削除されます。この操作は取り消せません。"
        confirmLabel="削除する"
        onCancel={() => setPendingDelete(false)}
        onConfirm={() => {
          setPendingDelete(false);
          void handleDelete();
        }}
      />
      <span className="sr-only">{pendingMember?.name ?? pendingMember?.handle ?? ""}</span>
    </BottomSheet>
  );
}
