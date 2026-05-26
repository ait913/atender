import type { RoomSummaryDto } from "@atender/shared";

export function RoomCard({ room, onClick }: { room: RoomSummaryDto; onClick: () => void }) {
  return (
    <button type="button" className="w-full rounded-md border border-border-subtle bg-bg-elevated p-4 text-left shadow-card transition hover:bg-bg-muted" onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{room.name}</h2>
          <p className="mt-1 text-sm text-fg-secondary">メンバー {room.memberCount} 人</p>
        </div>
        <span className="rounded-full bg-accent-50 px-2 py-1 text-xs font-semibold text-accent-700">{room.myRole}</span>
      </div>
      {room.upcomingEvent ? <p className="mt-3 text-sm text-fg-secondary">直近: {room.upcomingEvent.start.slice(5, 16).replace("T", " ")} {room.upcomingEvent.title}</p> : null}
    </button>
  );
}
