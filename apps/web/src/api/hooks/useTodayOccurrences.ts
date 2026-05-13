import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceStatus, TodayResponse } from "@atender/shared";
import { api } from "@/api/client";
import type { AttendanceRecordResponse, MarkAllPresentInput, MarkAllPresentResponse, MarkAttendanceInput } from "./types";

export function useTodayOccurrences(date?: string) {
  return useQuery({
    queryKey: ["today", date ?? "current"],
    queryFn: () => api<TodayResponse>("/api/today", { query: { date } }),
  });
}

export function useMarkAllPresent(onErrorToast: (message: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkAllPresentInput) => api<MarkAllPresentResponse>("/api/attendance/mark-all-present", { method: "POST", body }),
    onMutate: async (body) => {
      const key = ["today", body.date ?? "current"];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TodayResponse>(key);
      if (previous) {
        queryClient.setQueryData<TodayResponse>(key, {
          ...previous,
          occurrences: previous.occurrences.map((occurrence) => occurrence.status == null ? { ...occurrence, status: "PRESENT" } : occurrence),
        });
      }
      return { key, previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
      onErrorToast("保存できませんでした、もう一度試してください");
    },
    onSettled: (_data, _error, body) => queryClient.invalidateQueries({ queryKey: ["today", body.date ?? "current"] }),
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["today"] }),
  });
}
