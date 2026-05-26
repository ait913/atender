import type { FriendshipDto, FriendshipUserDto } from "@atender/shared";
import { Button } from "@/components/ui";

function otherUser(friendship: FriendshipDto, meId?: string): FriendshipUserDto {
  return friendship.sender.id === meId ? friendship.receiver : friendship.sender;
}

function avatarColor(id: string) {
  const palette = ["from-emerald-400 to-cyan-400", "from-pink-400 to-rose-500", "from-amber-300 to-orange-500", "from-violet-400 to-fuchsia-500", "from-sky-400 to-indigo-500"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function FriendCard({
  friendship,
  meId,
  variant,
  onAccept,
  onDecline,
  onCancel,
  onDelete,
  onBlock,
}: {
  friendship: FriendshipDto;
  meId?: string;
  variant: "received" | "sent" | "accepted" | "blocked";
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onBlock?: () => void;
}) {
  const user = otherUser(friendship, meId);
  const initial = (user.name ?? user.handle ?? "?").slice(0, 1).toUpperCase();
  return (
    <article className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <div className="flex items-center gap-4">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${avatarColor(user.id)} text-xl font-black text-bg-base`}>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight">{user.name ?? "名前未設定"}</p>
          <p className="truncate text-sm text-fg-secondary">@{user.handle ?? user.id.slice(0, 8)}</p>
        </div>
      </div>
      {variant !== "accepted" || onBlock || onDelete ? (
        <div className="mt-3 flex flex-wrap justify-end gap-3">
          {variant === "received" ? (
            <>
              <Button size="sm" variant="primary" onClick={onAccept}>承認</Button>
              <Button size="sm" onClick={onDecline}>拒否</Button>
            </>
          ) : null}
          {variant === "sent" ? <Button size="sm" onClick={onCancel}>取消</Button> : null}
          {variant === "accepted" ? (
            <>
              <Button size="sm" variant="ghost" onClick={onBlock}>ブロック</Button>
              <Button size="sm" variant="ghost" onClick={onDelete}>解除</Button>
            </>
          ) : null}
          {variant === "blocked" ? <Button size="sm" onClick={onDelete}>解除</Button> : null}
        </div>
      ) : null}
    </article>
  );
}
