import type { RoomSummaryDto } from "@atender/shared";

function roomTint(id: string) {
  const palette = ["from-status-present/80 to-cyan-500/40", "from-violet-500/80 to-fuchsia-500/40", "from-amber-400/80 to-rose-500/40", "from-sky-500/80 to-indigo-500/40"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function RoomCard({ room, onClick }: { room: RoomSummaryDto; onClick: () => void }) {
  return (
    <button
      type="button"
      className="group relative w-full overflow-hidden rounded-3xl bg-bg-elevated p-5 text-left shadow-card transition active:scale-[0.98]"
      onClick={onClick}
    >
      <div className={`absolute inset-0 -z-0 bg-gradient-to-br ${roomTint(room.id)} opacity-30 transition-opacity group-hover:opacity-50`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-black tracking-tight">{room.name}</h2>
          <p className="mt-1 text-sm font-medium text-fg-secondary">
            {room.memberCount} メンバー
          </p>
        </div>
        <span className="rounded-full bg-bg-base/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-fg-primary backdrop-blur">
          {room.myRole}
        </span>
      </div>
      {room.upcomingEvent ? (
        <p className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-bg-base/60 px-3 py-1.5 text-xs font-bold text-fg-primary backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500 shadow-glow" />
          {room.upcomingEvent.start.slice(5, 16).replace("T", " ")} · {room.upcomingEvent.title}
        </p>
      ) : null}
    </button>
  );
}
