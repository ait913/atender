import { Plus, User, Users } from "lucide-react";

export type HomeContext = { kind: "self" } | { kind: "room"; roomId: string };
export type ContextChipItem =
  | { kind: "self"; label: string }
  | { kind: "room"; roomId: string; roomName: string };

type Props = {
  items: readonly ContextChipItem[];
  selected: HomeContext;
  onChange: (next: HomeContext) => void;
  onAddRoom: () => void;
};

export function ContextChips({ items, selected, onChange, onAddRoom }: Props) {
  return (
    <div className="-mx-3 overflow-x-auto overscroll-x-contain px-3 py-1" data-testid="context-chips">
      <ul className="flex w-max gap-2">
        {items.map((item) => {
          const active =
            (item.kind === "self" && selected.kind === "self") ||
            (item.kind === "room" && selected.kind === "room" && selected.roomId === item.roomId);
          const label = item.kind === "self" ? item.label : item.roomName;
          return (
            <li key={item.kind === "self" ? "self" : item.roomId}>
              <button
                type="button"
                onClick={() => onChange(item.kind === "self" ? { kind: "self" } : { kind: "room", roomId: item.roomId })}
                aria-pressed={active}
                className={`flex h-10 items-center rounded-full border px-4 text-sm font-bold transition active:scale-[0.97] ${
                  active
                    ? "border-accent-500 bg-accent-500/15 text-accent-500 shadow-glow-soft"
                    : "border-border-subtle bg-bg-elevated text-fg-secondary hover:bg-fg-primary/6"
                }`}
              >
                {item.kind === "self" ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                <span className="ml-2 max-w-[14ch] truncate">{label}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onAddRoom}
            aria-label="ルームを追加"
            className="grid h-10 w-10 place-items-center rounded-full border border-border-subtle bg-bg-elevated text-fg-tertiary hover:bg-fg-primary/6"
          >
            <Plus className="h-4 w-4" />
          </button>
        </li>
      </ul>
    </div>
  );
}
