import { useParams } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { useState } from "react";
import { useRoom } from "@/api/hooks";
import { RoomSettingsSheet } from "@/components/sheet/RoomSettingsSheet";
import { RoomTimetable } from "./RoomTimetable";

export function RoomDetail() {
  const { id } = useParams({ from: "/rooms/$id" });
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
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-fg-primary/8 text-fg-secondary transition hover:bg-fg-primary/14 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          <Settings className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>
      <RoomTimetable roomId={id} />
      <RoomSettingsSheet roomId={id} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
