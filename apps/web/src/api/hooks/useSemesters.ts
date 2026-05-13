import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { SemesterCreateInput, SemesterResponse, SemestersResponse } from "./types";

export function useSemesters() {
  return useQuery({
    queryKey: ["semesters"],
    queryFn: () => api<SemestersResponse>("/api/semesters"),
  });
}

export function useCreateSemester() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SemesterCreateInput) => api<SemesterResponse>("/api/semesters", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["semesters"] }),
  });
}
