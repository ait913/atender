import { RoomCalendar } from "@/components/rooms/RoomCalendar";
import { RoomTimetable } from "@/components/rooms/RoomTimetable";
import { PersonalCalendar } from "./PersonalCalendar";
import { SelfTimetableView } from "./SelfTimetableView";
import type { HomeContext } from "./ContextChips";
import type { HomeViewMode } from "./HomeViewModeTabs";

type Props = {
  context: HomeContext;
  mode: HomeViewMode;
  semesterId: string | null;
};

export function HomeBody({ context, mode, semesterId }: Props) {
  if (context.kind === "self") {
    if (mode === "timetable") return <SelfTimetableView semesterId={semesterId} />;
    return <PersonalCalendar semesterId={semesterId} />;
  }
  if (mode === "timetable") return <RoomTimetable roomId={context.roomId} />;
  return <RoomCalendar roomId={context.roomId} />;
}
