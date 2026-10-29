import { Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMe, useRooms, useSemesters, useUserTimetables } from "@/api/hooks";
import { RoomCreateSheet } from "@/components/rooms/RoomCreateSheet";
import { JoinByCodeSheet } from "@/components/rooms/JoinByCodeSheet";
import { RoomSettingsSheet } from "@/components/sheet/RoomSettingsSheet";
import { TimetableSettingsSheet } from "@/components/sheet/TimetableSettingsSheet";
import * as pendingRoomJoin from "@/lib/pendingRoomJoin";
import { ContextChips, type ContextChipItem, type HomeContext } from "./ContextChips";
import { HomeBody } from "./HomeBody";
import { HomeSemesterPicker } from "./HomeSemesterPicker";
import { SelfTodayCTA } from "./SelfTodayCTA";

export function Home() {
  const me = useMe();
  const rooms = useRooms();
  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinSheet, setJoinSheet] = useState<{ initialCode?: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [context, setContext] = useState<HomeContext>({ kind: "self" });
  const [semesterId, setSemesterId] = useState<string | null>(null);

  useEffect(() => {
    const code = pendingRoomJoin.take();
    if (code !== null) setJoinSheet({ initialCode: code });
  }, []);

  useEffect(() => {
    if (semesterId !== null || me.isLoading) return;
    const initial = me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id;
    if (initial) setSemesterId(initial);
  }, [me.data?.user.defaultSemesterId, me.isLoading, semesters.data?.semesters, semesterId]);

  async function selectRoom(roomId: string) {
    await rooms.refetch();
    setContext({ kind: "room", roomId });
  }

  const chips = useMemo<ContextChipItem[]>(() => {
    const out: ContextChipItem[] = [{ kind: "self", label: "自分" }];
    for (const room of rooms.data?.rooms ?? []) out.push({ kind: "room", roomId: room.id, roomName: room.name });
    return out;
  }, [rooms.data?.rooms]);

  return (
    <div className="space-y-3 pb-32 md:pb-24">
      <ContextChips items={chips} selected={context} onChange={setContext} onAddRoom={(action) => action === "create" ? setCreateOpen(true) : setJoinSheet({})} />
      <HomeSemesterPicker
        semesterId={semesterId}
        onChange={setSemesterId}
        trailing={
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={context.kind === "self" ? "時間割の設定" : "ルームの設定"}
            data-testid={context.kind === "room" ? "home-room-settings" : undefined}
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-fg-primary/8 text-fg-secondary transition hover:bg-fg-primary/14 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            <Settings className="h-4 w-4" strokeWidth={2.25} />
          </button>
        }
      />
      <HomeBody context={context} semesterId={semesterId} />
      {createOpen ? <RoomCreateSheet open onClose={() => setCreateOpen(false)} onCreated={(room) => void selectRoom(room.id)} /> : null}
      {joinSheet ? <JoinByCodeSheet open initialCode={joinSheet.initialCode} onClose={() => setJoinSheet(null)} onJoined={(id) => void selectRoom(id)} /> : null}
      {context.kind === "self" ? (
        <TimetableSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} timetable={timetables.data?.userTimetables.find((item) => item.semesterId === semesterId) ?? null} />
      ) : (
        <RoomSettingsSheet
          key={context.roomId}
          roomId={context.roomId}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => { void rooms.refetch(); }}
          onRemoved={() => { setContext({ kind: "self" }); void rooms.refetch(); }}
        />
      )}
      {context.kind === "self" ? <SelfTodayCTA /> : null}
    </div>
  );
}
