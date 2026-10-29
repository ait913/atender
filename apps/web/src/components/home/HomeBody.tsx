import { RoomTimetable } from "@/components/rooms/RoomTimetable";
import { SelfTimetableView } from "./SelfTimetableView";
import type { HomeContext } from "./ContextChips";

type Props = {
  context: HomeContext;
  semesterId: string | null;
  settingsOpen?: boolean;
  onCloseSettings?: () => void;
};

export function HomeBody({ context, semesterId, settingsOpen, onCloseSettings }: Props) {
  if (context.kind === "self") return <SelfTimetableView semesterId={semesterId} settingsOpen={settingsOpen} onCloseSettings={onCloseSettings} />;
  return <RoomTimetable key={context.roomId} roomId={context.roomId} semesterId={semesterId} />;
}
