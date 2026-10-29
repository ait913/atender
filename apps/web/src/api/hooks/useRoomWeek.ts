import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { RoomWeekDto } from "./types";

export function useRoomWeek(id: string | undefined, weekStart: string, semesterId: string | null) {
  return useQuery({
    queryKey: QK.roomWeek(id ?? "", weekStart, semesterId ?? "none"),
    queryFn: () => api<RoomWeekDto>(`/api/rooms/${id}/week`, { query: { weekStart, semesterId } }),
    enabled: Boolean(id),
  });
}
