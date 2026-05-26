import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { TemplateCopyInput, TemplateCreateInput, TemplateResponse, TemplatesResponse, UserTimetableResponse } from "./types";

export function useTemplates(query: { schoolId?: string | null; departmentId?: string | null; q?: string; limit?: number }) {
  return useQuery({
    queryKey: ["templates", query],
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
