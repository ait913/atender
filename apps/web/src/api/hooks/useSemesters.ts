import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { SemesterCreateInput, SemesterResponse, SemesterUpdateInput, SemestersResponse } from "./types";

export function useSemesters() {
  return useQuery({
    queryKey: QK.semesters(),
    queryFn: () => api<SemestersResponse>("/api/semesters"),
  });
}

export function useCreateSemester() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SemesterCreateInput) => api<SemesterResponse>("/api/semesters", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.semesters() }),
  });
}

export function useDeleteSemester() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/semesters/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.semesters() }),
  });
}

export function useUpdateSemester() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SemesterUpdateInput }) =>
      api<SemesterResponse>(`/api/semesters/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["day"] });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["user-timetables"] });
    },
  });
}
