import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK, QP } from "@/api/queryKeys";
import type { SemesterCreateInput, SemesterResponse, SemestersResponse, SemesterUpdateInput, OkResponse } from "./types";
import { useApiMutation } from "./useApiMutation";

export function useSemesters() {
  return useQuery({
    queryKey: QK.semesters(),
    queryFn: () => api<SemestersResponse>("/api/semesters"),
  });
}

export function useCreateSemester() {
  return useApiMutation<SemesterCreateInput, SemesterResponse>((body) => api<SemesterResponse>("/api/semesters", { method: "POST", body }), [
    QK.semesters(),
    { predicate: QP.userTimetables },
    { predicate: QP.today },
    { predicate: QP.stats },
  ]);
}

export function useUpdateSemester(id?: string) {
  return useApiMutation<SemesterUpdateInput, SemesterResponse>((body) => api<SemesterResponse>(`/api/semesters/${id}`, { method: "PATCH", body }), [
    QK.semesters(),
    ...(id ? [QK.semester(id), QK.stats(id)] : []),
    { predicate: QP.userTimetables },
    { predicate: QP.today },
    { predicate: QP.stats },
  ]);
}

export function useDeleteSemester(id?: string) {
  return useApiMutation<void, OkResponse>(() => api<OkResponse>(`/api/semesters/${id}`, { method: "DELETE" }), [
    QK.semesters(),
    { predicate: QP.userTimetables },
    { predicate: QP.today },
    { predicate: QP.stats },
  ]);
}
