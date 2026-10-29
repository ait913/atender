import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { TemplateCopyInput, TemplateCreateInput, TemplateResponse, TemplatesResponse, UserTimetableResponse } from "./types";

export function useTemplates(query: { schoolId?: string | null; departmentId?: string | null; q?: string; limit?: number }, options: { enabled?: boolean; staleTime?: number } = {}) {
  return useQuery({
    queryKey: ["templates", query],
    enabled: options.enabled,
    staleTime: options.staleTime,
    queryFn: () => api<TemplatesResponse>("/api/timetable-templates", { query: { ...query, schoolId: query.schoolId, departmentId: query.departmentId, limit: query.limit ?? 20 } }),
  });
}

export function useCopyTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, input }: { templateId: string; input: TemplateCopyInput }) =>
      api<UserTimetableResponse>(`/api/timetable-templates/${templateId}/copy`, { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-timetables"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
      queryClient.invalidateQueries({ queryKey: ["day"] });
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TemplateCreateInput) => api<TemplateResponse>("/api/timetable-templates", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useUnpublishTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<TemplateResponse>(`/api/timetable-templates/${id}`, { method: "PATCH", body: { isPublic: false } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-timetables"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
