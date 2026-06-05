import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { TimetableSuspensionCreateInput, TimetableSuspensionResponse, TimetableSuspensionsResponse } from "./types";

export function useTimetableSuspensions(range: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: QK.timetableSuspensions(range),
    queryFn: () => api<TimetableSuspensionsResponse>("/api/timetable-suspensions", { query: range }),
  });
}

export function useCreateTimetableSuspension(date?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TimetableSuspensionCreateInput) =>
      api<TimetableSuspensionResponse>("/api/timetable-suspensions", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable-suspensions"] });
      queryClient.invalidateQueries({ queryKey: ["day"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      if (date) queryClient.invalidateQueries({ queryKey: QK.dayDetail(date) });
    },
  });
}

export function useDeleteTimetableSuspension(date?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/timetable-suspensions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable-suspensions"] });
      queryClient.invalidateQueries({ queryKey: ["day"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      if (date) queryClient.invalidateQueries({ queryKey: QK.dayDetail(date) });
    },
  });
}
