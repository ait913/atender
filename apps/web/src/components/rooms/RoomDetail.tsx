import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useRoom } from "@/api/hooks";
import { RoomSettingsSheet } from "@/components/sheet/RoomSettingsSheet";
import { RoomCalendar } from "./RoomCalendar";
import { RoomTimetable } from "./RoomTimetable";

export function RoomDetail() {
  const { id } = useParams({ from: "/rooms/$id" });
  const [tab, setTab] = useState<"calendar" | "timetable">("calendar");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const room = useRoom(id);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{room.data?.room.name ?? "ルーム"}</h1>
          {room.data?.room.description ? <p className="text-sm text-fg-secondary">{room.data.room.description}</p> : null}
        </div>
        <button
          type="button"
          aria-label="ルームの設定"
          onClick={() => setSettingsOpen(true)}
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-fg-primary/8 text-xl text-fg-secondary transition hover:bg-fg-primary/14 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          ⚙
        </button>
      </div>
      <div className="flex rounded-full bg-bg-muted p-1">
        {(["calendar", "timetable"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === item ? "bg-accent-500 text-fg-on-accent shadow-glow-soft" : "text-fg-secondary hover:bg-fg-primary/6"
            }`}
            onClick={() => setTab(item)}
          >
            {item === "calendar" ? "カレンダー" : "時間割"}
          </button>
        ))}
      </div>
      {tab === "calendar" ? <RoomCalendar roomId={id} /> : <RoomTimetable roomId={id} />}
      <RoomSettingsSheet roomId={id} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
