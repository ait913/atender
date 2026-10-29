import { useEffect, useMemo, useState } from "react";
import { showToast } from "@/lib/toast";
import { APP_URL } from "@/api/client";
import { useMe, useRegenerateRoomInvite, useRemoveRoomMember, useRoom, useRoomAction, useRoomMembers, useUpdateRoom } from "@/api/hooks";
import { memberColor } from "@/lib/memberColor";
import { Button, ConfirmDialog, Field, Input, Textarea, Toggle } from "@/components/ui";
import { BottomSheet } from "./BottomSheet";

export function RoomSettingsSheet({ roomId, open, onClose, onChanged, onRemoved }: { roomId: string; open: boolean; onClose: () => void; onChanged?: () => void; onRemoved?: () => void }) {
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
    const previous = showMemberTimetables;
    if (patch.showMemberTimetables !== undefined) setShowMemberTimetables(patch.showMemberTimetables);
    try {
      await update.mutateAsync(patch);
      onChanged?.();
    } catch {
      if (patch.showMemberTimetables !== undefined) setShowMemberTimetables(previous);
      showToast("保存できませんでした、もう一度試してください");
    }
  }

  async function handleCopyInvite() {
    await navigator.clipboard?.writeText(`${APP_URL}/rooms/join/${room.data?.room.inviteCode ?? ""}`);
    setCopyMessage("コピーしました");
  }

  async function handleLeave() {
    try {
      await leave.mutateAsync();
      onClose();
      onRemoved?.();
    } catch {
      showToast("退出できませんでした");
    }
  }

  async function handleDelete() {
    try {
      await del.mutateAsync();
      onClose();
      onRemoved?.();
    } catch {
      showToast("削除できませんでした");
    }
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
      <Field label="説明">
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
        <Toggle
          checked={showMemberTimetables}
          disabled={!isOwner || update.isPending}
          onChange={(next) => {
            void persist({ showMemberTimetables: next });
          }}
          label="メンバー時間割を表示"
        />
      </div>
      <section className="border-t border-fg-primary/8 pt-5">
        <h3 className="mb-3 text-sm font-black text-fg-primary">メンバー ({members.data?.members.length ?? 0})</h3>
        <ul className="space-y-2">
          {(members.data?.members ?? []).map((member) => (
            <li key={member.userId} className="flex items-center gap-3 rounded-2xl bg-fg-primary/4 p-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-full text-xs font-black text-white"
                style={{ background: memberColor(member.userId) }}
                aria-hidden
              >
                {(member.name ?? member.handle ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-fg-primary">{member.name ?? member.handle ?? "No name"}</p>
                <p className="truncate text-xs text-fg-tertiary">@{member.handle ?? member.userId.slice(0, 8)} · {member.role === "OWNER" ? "オーナー" : "メンバー"}</p>
              </div>
              {isOwner && member.userId !== me.data?.user.id && member.role !== "OWNER" ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPendingRemove(member.userId)}>追放</Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {isOwner ? (
        <section className="space-y-3 border-t border-fg-primary/8 pt-5">
          <h3 className="text-sm font-black text-fg-primary">招待リンク</h3>
          <p className="break-all rounded-2xl bg-fg-primary/4 p-3 text-xs text-fg-secondary">
            {APP_URL}/rooms/join/{room.data?.room.inviteCode ?? ""}
          </p>
          {copyMessage ? <p className="text-xs font-bold text-accent-500">{copyMessage}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleCopyInvite()}>リンクをコピー</Button>
            {typeof navigator.share === "function" ? (
              <Button type="button" variant="ghost" onClick={() => {
                void navigator.share({ url: `${APP_URL}/rooms/join/${room.data?.room.inviteCode ?? ""}` }).catch(() => {});
              }}>共有</Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => regenerate.mutate(undefined, {
              onSuccess: () => onChanged?.(),
              onError: () => showToast("保存できませんでした、もう一度試してください"),
            })}>再発行</Button>
          </div>
        </section>
      ) : null}
      <ConfirmDialog
        open={pendingRemove != null}
        title="メンバーを追放しますか？"
        confirmLabel="追放"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (pendingRemove) removeMember.mutate(pendingRemove, {
            onSuccess: () => onChanged?.(),
            onError: () => showToast("削除できませんでした"),
          });
          setPendingRemove(null);
        }}
      />
      <ConfirmDialog
        open={pendingLeave}
        title="ルームを退出しますか？"
        confirmLabel="退出"
        onCancel={() => setPendingLeave(false)}
        onConfirm={() => {
          setPendingLeave(false);
          void handleLeave();
        }}
      />
      <ConfirmDialog
        open={pendingDelete}
        title="ルームを削除しますか？"
        confirmLabel="削除"
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
