import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceStatus, TodayResponse } from "@atender/shared";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { AttendanceRecordResponse, MarkAllPresentInput, MarkAllPresentResponse, MarkAttendanceInput } from "./types";

function invalidateTodayAndStats(queryClient: ReturnType<typeof useQueryClient>, semesterId?: string | null) {
  void queryClient.invalidateQueries({ predicate: QP.today });
  if (semesterId) void queryClient.invalidateQueries({ queryKey: QK.stats(semesterId) });
  else void queryClient.invalidateQueries({ predicate: QP.stats });
}

export function useToday(date?: string) {
  return useQuery({
    queryKey: QK.today(date),
    queryFn: () => api<TodayResponse>("/api/today", { query: { date } }),
  });
}

export const useTodayOccurrences = useToday;

export function useMarkAllPresent(onErrorToast?: (message: string) => void, semesterId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkAllPresentInput) => api<MarkAllPresentResponse>("/api/attendance/mark-all-present", { method: "POST", body }),
    onMutate: async () => {
      await queryClient.cancelQueries({ predicate: QP.today });
      const queries = queryClient.getQueriesData<TodayResponse>({ predicate: QP.today });
      for (const [key, previous] of queries) {
        if (!previous) continue;
        queryClient.setQueryData<TodayResponse>(key, {
          ...previous,
          occurrences: previous.occurrences.map((occurrence) => (occurrence.status == null ? { ...occurrence, status: "PRESENT" } : occurrence)),
        });
      }
      return { queries };
    },
    onSuccess: () => invalidateTodayAndStats(queryClient, semesterId),
    onError: (_error, _body, context) => {
      for (const [key, data] of context?.queries ?? []) queryClient.setQueryData(key, data);
      onErrorToast?.("保存できませんでした");
    },
  });
}

export function usePatchAttendance(onErrorToast?: (message: string) => void, semesterId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceId, input }: { occurrenceId: string; input: MarkAttendanceInput }) =>
      api<AttendanceRecordResponse>(`/api/attendance/${occurrenceId}`, { method: "POST", body: input }),
    onMutate: async ({ occurrenceId, input }) => {
      await queryClient.cancelQueries({ predicate: QP.today });
      const queries = queryClient.getQueriesData<TodayResponse>({ predicate: QP.today });
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<TodayResponse>(key, {
          ...data,
          occurrences: data.occurrences.map((occurrence) => (occurrence.id === occurrenceId ? { ...occurrence, status: input.status as AttendanceStatus } : occurrence)),
        });
      }
      return { queries };
    },
    onSuccess: () => invalidateTodayAndStats(queryClient, semesterId),
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.queries ?? []) queryClient.setQueryData(key, data);
      onErrorToast?.("保存できませんでした");
    },
  });
}

export function useDeleteAttendance(onErrorToast?: (message: string) => void, semesterId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceId: string) => api<OkResponse>(`/api/attendance/${occurrenceId}`, { method: "DELETE" }),
    onMutate: async (occurrenceId) => {
      await queryClient.cancelQueries({ predicate: QP.today });
      const queries = queryClient.getQueriesData<TodayResponse>({ predicate: QP.today });
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<TodayResponse>(key, {
          ...data,
          occurrences: data.occurrences.map((occurrence) => (occurrence.id === occurrenceId ? { ...occurrence, status: null } : occurrence)),
        });
      }
      return { queries };
    },
    onSuccess: () => invalidateTodayAndStats(queryClient, semesterId),
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.queries ?? []) queryClient.setQueryData(key, data);
      onErrorToast?.("保存できませんでした");
    },
  });
}
