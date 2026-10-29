import { useEffect, useRef, useState } from "react";
import { Plus, User, Users } from "lucide-react";

export type HomeContext = { kind: "self" } | { kind: "room"; roomId: string };
export type ContextChipItem =
  | { kind: "self"; label: string }
  | { kind: "room"; roomId: string; roomName: string };

type Props = {
  items: readonly ContextChipItem[];
  selected: HomeContext;
  onChange: (next: HomeContext) => void;
  onAddRoom: (action: "create" | "join") => void;
};

export function ContextChips({ items, selected, onChange, onAddRoom }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);
  return (
    <div className="relative">
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
              ref={triggerRef}
              onClick={() => setMenuOpen((value) => !value)}
              data-testid="rooms-add"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="ルームを追加"
              className="grid h-10 w-10 place-items-center rounded-full border border-border-subtle bg-bg-elevated text-fg-tertiary hover:bg-fg-primary/6"
            >
              <Plus className="h-4 w-4" />
            </button>
          </li>
        </ul>
      </div>
      {menuOpen ? (
        <div ref={menuRef} role="menu" className="absolute right-0 top-full z-50 min-w-44 rounded-2xl bg-bg-elevated p-1.5 shadow-card">
          {(["create", "join"] as const).map((action) => (
            <button key={action} type="button" role="menuitem"
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-fg-primary transition hover:bg-fg-primary/8 active:scale-[0.98]"
              onClick={() => { setMenuOpen(false); onAddRoom(action); }}
            >{action === "create" ? "ルームを作成" : "リンクで参加"}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
