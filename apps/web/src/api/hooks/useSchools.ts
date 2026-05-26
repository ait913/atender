import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { DepartmentCreateInput, SchoolCreateInput, SchoolDto } from "@atender/shared";
import type { DepartmentsResponse, SchoolsResponse, SchoolSearchQuery } from "./types";
import { useApiMutation } from "./useApiMutation";

export function useSchools(query: Partial<SchoolSearchQuery>) {
  const q = { q: query.q, prefecture: query.prefecture, kind: query.kind };
  return useQuery({
    queryKey: QK.schools(query),
    queryFn: () => api<SchoolsResponse>("/api/schools", { query }),
  });
}

export function useCreateSchool() {
  return useApiMutation<SchoolCreateInput, { school: SchoolDto }>((body) => api<{ school: SchoolDto }>("/api/schools", { method: "POST", body }), [
    { predicate: QP.schools },
  ]);
}

export function useDepartments(schoolId?: string | null, q?: string) {
  return useQuery({
    queryKey: QK.departments(schoolId, q),
    enabled: Boolean(schoolId),
    queryFn: () => api<DepartmentsResponse>(`/api/schools/${schoolId}/departments`, { query: { q, limit: 50 } }),
  });
}

export function useCreateDepartment(schoolId?: string | null) {
  return useApiMutation<DepartmentCreateInput, DepartmentsResponse["departments"][number] | { department: DepartmentsResponse["departments"][number] }>(
    (body) => api<{ department: DepartmentsResponse["departments"][number] }>(`/api/schools/${schoolId}/departments`, { method: "POST", body }),
    schoolId ? [QK.departments(schoolId)] : [],
  );
}
