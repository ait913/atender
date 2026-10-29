import { RoomTimetable } from "@/components/rooms/RoomTimetable";
import { SelfTimetableView } from "./SelfTimetableView";
import type { HomeContext } from "./ContextChips";

type Props = {
  context: HomeContext;
  semesterId: string | null;
};

export function HomeBody({ context, semesterId }: Props) {
  if (context.kind === "self") return <SelfTimetableView semesterId={semesterId} />;
  return <RoomTimetable key={context.roomId} roomId={context.roomId} semesterId={semesterId} />;
}
