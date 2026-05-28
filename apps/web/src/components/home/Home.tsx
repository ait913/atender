import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMe, useRooms } from "@/api/hooks";
import { ContextChips, type ContextChipItem, type HomeContext } from "./ContextChips";
import { HomeBody } from "./HomeBody";
import { HomeSemesterPicker } from "./HomeSemesterPicker";
import { HomeViewModeTabs, type HomeViewMode } from "./HomeViewModeTabs";
import { SelfTodayCTA } from "./SelfTodayCTA";

export function Home() {
  const me = useMe();
  const rooms = useRooms();
  const navigate = useNavigate();
  const [context, setContext] = useState<HomeContext>({ kind: "self" });
  const [mode, setMode] = useState<HomeViewMode>("timetable");
  const [semesterId, setSemesterId] = useState<string | null>(null);

  useEffect(() => {
    if (semesterId == null && me.data?.user.defaultSemesterId) setSemesterId(me.data.user.defaultSemesterId);
  }, [me.data?.user.defaultSemesterId, semesterId]);

  const chips = useMemo<ContextChipItem[]>(() => {
    const out: ContextChipItem[] = [{ kind: "self", label: "自分" }];
    for (const room of rooms.data?.rooms ?? []) out.push({ kind: "room", roomId: room.id, roomName: room.name });
    return out;
  }, [rooms.data?.rooms]);

  return (
    <div className="space-y-3 pb-32 md:pb-0">
      <ContextChips items={chips} selected={context} onChange={setContext} onAddRoom={() => void navigate({ to: "/rooms" })} />
      <HomeViewModeTabs mode={mode} onChange={setMode} />
      {context.kind === "self" ? <HomeSemesterPicker semesterId={semesterId} onChange={setSemesterId} /> : null}
      <HomeBody context={context} mode={mode} semesterId={semesterId} />
      {context.kind === "self" && mode === "timetable" ? <SelfTodayCTA /> : null}
    </div>
  );
}
