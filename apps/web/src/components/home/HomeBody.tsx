import { RoomTimetable } from "@/components/rooms/RoomTimetable";
import { SelfTimetableView } from "./SelfTimetableView";
import type { HomeContext } from "./ContextChips";

type Props = {
  context: HomeContext;
  semesterId: string | null;
  onSemesterChange: (id: string) => void;
};

export function HomeBody({ context, semesterId, onSemesterChange }: Props) {
  if (context.kind === "self") return <SelfTimetableView semesterId={semesterId} onSemesterChange={onSemesterChange} />;
  return <RoomTimetable roomId={context.roomId} />;
}
