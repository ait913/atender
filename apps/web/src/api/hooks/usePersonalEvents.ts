import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { PersonalEventCreateInput, PersonalEventResponse, PersonalEventsResponse, PersonalEventUpdateInput } from "./types";

type PersonalEventRange = { from: string; to: string };
type EditScope = "single" | "future" | "all";

function invalidatePersonalEventViews(queryClient: ReturnType<typeof useQueryClient>, date?: string | null) {
  queryClient.invalidateQueries({ queryKey: ["personal-events"] });
  queryClient.invalidateQueries({ queryKey: ["day"] });
  if (date) queryClient.invalidateQueries({ queryKey: QK.dayDetail(date) });
}

export function usePersonalEvents(range: PersonalEventRange) {
  return useQuery({
    queryKey: QK.personalEvents(range),
    queryFn: () => api<PersonalEventsResponse>("/api/personal-events", { query: range }),
  });
}

export function useCreatePersonalEvent(date?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonalEventCreateInput) => api<PersonalEventResponse>("/api/personal-events", { method: "POST", body }),
    onSuccess: () => invalidatePersonalEventViews(queryClient, date),
  });
}

export function useUpdatePersonalEvent(id?: string, date?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonalEventUpdateInput) => api<PersonalEventResponse>(`/api/personal-events/${id}`, { method: "PATCH", body }),
    onSuccess: () => invalidatePersonalEventViews(queryClient, date),
  });
}

export function useDeletePersonalEvent(date?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; scope: EditScope; originalDate?: string }) =>
      api<{ ok: true }>(`/api/personal-events/${args.id}`, {
        method: "DELETE",
        query: { scope: args.scope, ...(args.originalDate ? { originalDate: args.originalDate } : {}) },
      }),
    onSuccess: () => invalidatePersonalEventViews(queryClient, date),
  });
}
