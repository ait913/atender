import type { FriendshipDto, FriendshipUserDto } from "@atender/shared";
import { Button } from "@/components/ui";

function otherUser(friendship: FriendshipDto, meId?: string): FriendshipUserDto {
  return friendship.sender.id === meId ? friendship.receiver : friendship.sender;
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
  return (
    <article className="rounded-md border border-border-subtle bg-bg-elevated p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{user.name ?? "No name"}</p>
          <p className="text-sm text-fg-secondary">@{user.handle ?? user.id.slice(0, 8)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {variant === "received" ? <><Button size="sm" variant="primary" onClick={onAccept}>承認</Button><Button size="sm" onClick={onDecline}>拒否</Button></> : null}
          {variant === "sent" ? <Button size="sm" onClick={onCancel}>取消</Button> : null}
          {variant === "accepted" ? <><Button size="sm" onClick={onBlock}>ブロック</Button><Button size="sm" variant="ghost" onClick={onDelete}>解除</Button></> : null}
          {variant === "blocked" ? <Button size="sm" onClick={onDelete}>解除</Button> : null}
        </div>
      </div>
    </article>
  );
}
