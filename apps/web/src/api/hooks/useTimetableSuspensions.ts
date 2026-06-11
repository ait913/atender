import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type {
  BulkTimetableSuspensionInput,
  BulkTimetableSuspensionRemoveInput,
  BulkTimetableSuspensionRemoveResponse,
  BulkTimetableSuspensionResponse,
  TimetableSuspensionCreateInput,
  TimetableSuspensionResponse,
  TimetableSuspensionsResponse,
} from "./types";

function invalidateTimetableSuspensionViews(queryClient: ReturnType<typeof useQueryClient>, date?: string | null) {
  queryClient.invalidateQueries({ queryKey: ["timetable-suspensions"] });
  queryClient.invalidateQueries({ queryKey: ["day"] });
  queryClient.invalidateQueries({ queryKey: ["semesters"] });
  queryClient.invalidateQueries({ queryKey: ["stats"] });
  queryClient.invalidateQueries({ queryKey: ["today"] });
  if (date) queryClient.invalidateQueries({ queryKey: QK.dayDetail(date) });
}

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
      invalidateTimetableSuspensionViews(queryClient, date);
    },
  });
}

export function useDeleteTimetableSuspension(date?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/timetable-suspensions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateTimetableSuspensionViews(queryClient, date);
    },
  });
}

export function useBulkCreateTimetableSuspensions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkTimetableSuspensionInput) =>
      api<BulkTimetableSuspensionResponse>("/api/timetable-suspensions/bulk", { method: "POST", body }),
    onSuccess: () => invalidateTimetableSuspensionViews(queryClient),
  });
}

export function useBulkRemoveTimetableSuspensions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkTimetableSuspensionRemoveInput) =>
      api<BulkTimetableSuspensionRemoveResponse>("/api/timetable-suspensions/bulk-remove", { method: "POST", body }),
    onSuccess: () => invalidateTimetableSuspensionViews(queryClient),
  });
}
