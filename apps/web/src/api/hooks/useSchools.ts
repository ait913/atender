import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { DepartmentCreateInput, SchoolCreateInput, SchoolDto } from "@atender/shared";
import type { DepartmentsResponse, SchoolsResponse, SchoolSearchQuery } from "./types";

export function useSchools(query: Partial<SchoolSearchQuery>) {
  return useQuery({
    queryKey: ["schools", query],
    queryFn: () => api<SchoolsResponse>("/api/schools", { query }),
  });
}

export function useCreateSchool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SchoolCreateInput) => api<{ school: SchoolDto }>("/api/schools", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schools"] }),
  });
}

export function useDepartments(schoolId?: string, q?: string) {
  return useQuery({
    queryKey: ["departments", schoolId, q],
    enabled: Boolean(schoolId),
    queryFn: () => api<DepartmentsResponse>(`/api/schools/${schoolId}/departments`, { query: { q, limit: 50 } }),
  });
}

export function useCreateDepartment(schoolId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DepartmentCreateInput) => api<{ department: DepartmentsResponse["departments"][number] }>(`/api/schools/${schoolId}/departments`, { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["departments", schoolId] }),
  });
}
