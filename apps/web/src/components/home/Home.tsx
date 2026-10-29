import type { SemesterDto } from "@atender/shared";
import { ConfirmDialog } from "@/components/ui";
import * as SemesterRollover from "@/lib/SemesterRollover";
import * as SchoolClock from "@/lib/SchoolClock";
import { SemesterCreateSheet } from "./SemesterCreateSheet";
import { Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [rolloverTarget, setRolloverTarget] = useState<SemesterDto | null>(null);
  const [proposal, setProposal] = useState<SemesterRollover.SemesterProposal | null>(null);
  const [mounted, setMounted] = useState(false);
  const evaluated = useRef(false);

  const evaluateRollover = useCallback(() => {
    if (!mounted || !semesters.isSuccess || createOpen || joinSheet || settingsOpen || proposal || rolloverTarget) return;
    setRolloverTarget(SemesterRollover.promptTarget(semesters.data.semesters, SchoolClock.todayString(), SemesterRollover.readDismissed()));
  }, [mounted, semesters.isSuccess, semesters.data, createOpen, joinSheet, settingsOpen, proposal, rolloverTarget]);

  useEffect(() => {
    if (!mounted || !semesters.isSuccess || evaluated.current) return;
    evaluated.current = true;
    evaluateRollover();
  }, [mounted, semesters.isSuccess, createOpen, joinSheet, settingsOpen, proposal, rolloverTarget, evaluateRollover]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") evaluateRollover();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [evaluateRollover]);

  useEffect(() => {
    setMounted(true);
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
      <ConfirmDialog
        open={rolloverTarget !== null}
        title="前回の学期が終了しました"
        body={rolloverTarget ? SemesterRollover.alertMessage(rolloverTarget) : undefined}
        confirmLabel="作成する"
        confirmVariant="primary"
        cancelLabel="あとで"
        onConfirm={() => {
          if (rolloverTarget) setProposal(SemesterRollover.proposal(rolloverTarget, SchoolClock.todayString()));
          setRolloverTarget(null);
        }}
        onCancel={() => {
          if (rolloverTarget) SemesterRollover.writeDismissed(rolloverTarget.id);
          setRolloverTarget(null);
        }}
      />
      {proposal ? <SemesterCreateSheet open proposal={proposal} onClose={() => setProposal(null)} onCreated={(created) => { setSemesterId(created.id); void semesters.refetch(); }} /> : null}
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
