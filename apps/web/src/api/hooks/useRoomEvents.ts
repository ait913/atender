import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { CreateRoomEventInput, RoomEventsResponse } from "./types";

export function useRoomEvents(id: string | undefined, range: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: QK.roomEvents(id ?? "", range),
    queryFn: () => api<RoomEventsResponse>(`/api/rooms/${id}/events`, { query: range }),
    enabled: Boolean(id),
  });
}

export function useCreateRoomEvent(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRoomEventInput) => api(`/api/rooms/${id}/events`, { method: "POST", body }),
    onSuccess: () => {
      if (!id) return;
      queryClient.invalidateQueries({ queryKey: ["rooms", id, "events"] });
      queryClient.invalidateQueries({ queryKey: ["rooms", id, "week"] });
    },
  });
}
