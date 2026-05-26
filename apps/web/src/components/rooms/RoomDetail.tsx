import { useParams } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useState } from "react";
import { APP_URL } from "@/api/client";
import { useRegenerateRoomInvite, useRoom, useRoomMembers, useRoomWeek } from "@/api/hooks";
import { Button, Panel } from "@/components/ui";
import { RoomAvailabilityHeatmap } from "./RoomAvailabilityHeatmap";
import { RoomEventCreateSheet } from "./RoomEventCreateSheet";
import { RoomWeekView } from "./RoomWeekView";

export function RoomDetail() {
  const { id } = useParams({ from: "/rooms/$id" });
  const [tab, setTab] = useState<"week" | "availability" | "members">("week");
  const [eventOpen, setEventOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(dayjs().startOf("week").add(1, "day").format("YYYY-MM-DD"));
  const room = useRoom(id);
  const week = useRoomWeek(id, weekStart);
  const members = useRoomMembers(id);
  const invite = useRegenerateRoomInvite(id);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{room.data?.room.name ?? "ルーム"}</h1>
          <p className="text-sm text-fg-secondary">{room.data?.room.description}</p>
        </div>
        <Button type="button" variant="primary" onClick={() => setEventOpen(true)}>予定を追加</Button>
      </div>
      <div className="flex rounded-md bg-bg-muted p-1">
        {(["week", "availability", "members"] as const).map((item) => <button key={item} type="button" className={`flex-1 rounded-sm px-3 py-2 text-sm font-semibold ${tab === item ? "bg-bg-elevated shadow-card" : "text-fg-secondary"}`} onClick={() => setTab(item)}>{item === "week" ? "今週" : item === "availability" ? "みんなの空き" : "メンバー"}</button>)}
      </div>
      {tab !== "members" ? (
        <div className="flex items-center justify-between gap-3">
          <Button type="button" onClick={() => setWeekStart(dayjs(weekStart).subtract(1, "week").format("YYYY-MM-DD"))}>前週</Button>
          <p className="text-sm font-semibold">{weekStart} 週</p>
          <Button type="button" onClick={() => setWeekStart(dayjs(weekStart).add(1, "week").format("YYYY-MM-DD"))}>次週</Button>
        </div>
      ) : null}
      {tab === "week" && week.data ? <RoomWeekView week={week.data} /> : null}
      {tab === "availability" && week.data ? <RoomAvailabilityHeatmap week={week.data} /> : null}
      {tab === "members" ? (
        <Panel className="space-y-3">
          {(members.data?.members ?? []).map((member) => <div key={member.userId} className="flex items-center justify-between border-b border-border-subtle py-2 last:border-b-0"><span>{member.name ?? member.handle ?? member.userId}</span><span className="text-xs text-fg-secondary">{member.role}</span></div>)}
          <div className="flex flex-wrap gap-2 pt-3">
            <Button type="button" onClick={() => navigator.clipboard?.writeText(`${APP_URL}/rooms/join/${room.data?.room.inviteCode ?? ""}`)}>招待リンクをコピー</Button>
            <Button type="button" onClick={() => invite.mutate()}>再発行</Button>
          </div>
        </Panel>
      ) : null}
      <RoomEventCreateSheet roomId={id} open={eventOpen} onClose={() => setEventOpen(false)} />
    </div>
  );
}
