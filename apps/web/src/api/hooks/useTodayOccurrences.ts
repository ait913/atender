import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceStatus, TodayResponse } from "@atender/shared";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { AttendanceRecordResponse, MarkAllPresentInput, MarkAllPresentResponse, MarkAttendanceInput } from "./types";

export function useTodayOccurrences(date?: string) {
  return useQuery({
    queryKey: QK.today(date),
    queryFn: () => api<TodayResponse>("/api/today", { query: { date } }),
  });
}

export function useMarkAllPresent(onErrorToast: (message: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkAllPresentInput) => api<MarkAllPresentResponse>("/api/attendance/mark-all-present", { method: "POST", body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ["today"] });
      const queries = queryClient.getQueriesData<TodayResponse>({ queryKey: ["today"] });
      for (const [key, previous] of queries) {
        if (!previous) continue;
        queryClient.setQueryData<TodayResponse>(key, {
          ...previous,
          occurrences: previous.occurrences.map((occurrence) => occurrence.status == null ? { ...occurrence, status: "PRESENT" } : occurrence),
        });
      }
      return { queries };
    },
    onError: (_error, _body, context) => {
      for (const [key, data] of context?.queries ?? []) queryClient.setQueryData(key, data);
      onErrorToast("保存できませんでした、もう一度試してください");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });
}

export function usePatchAttendance(onErrorToast: (message: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceId, input }: { occurrenceId: string; input: MarkAttendanceInput }) =>
      api<AttendanceRecordResponse>(`/api/attendance/${occurrenceId}`, { method: "POST", body: input }),
    onMutate: async ({ occurrenceId, input }) => {
      await queryClient.cancelQueries({ queryKey: ["today"] });
      const queries = queryClient.getQueriesData<TodayResponse>({ queryKey: ["today"] });
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<TodayResponse>(key, {
          ...data,
          occurrences: data.occurrences.map((occurrence) =>
            occurrence.id === occurrenceId ? { ...occurrence, status: input.status as AttendanceStatus } : occurrence,
          ),
        });
      }
      return { queries };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.queries ?? []) queryClient.setQueryData(key, data);
      onErrorToast("保存できませんでした、もう一度試してください");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });
}
