import { useQueries } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { RoomWeekDto } from "./types";

export function useRoomMonth(roomId: string | undefined, weekStarts: string[]) {
  return useQueries({
    queries: weekStarts.map((weekStart) => ({
      queryKey: QK.roomWeek(roomId ?? "", weekStart),
      queryFn: () => api<RoomWeekDto>(`/api/rooms/${roomId}/week`, { query: { weekStart } }),
      enabled: Boolean(roomId),
    })),
  });
}
