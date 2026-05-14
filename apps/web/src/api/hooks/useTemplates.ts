import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK, QP } from "@/api/queryKeys";
import type { TemplateCopyInput, TemplateCreateInput, TemplateResponse, TemplatesResponse, UserTimetableResponse, OkResponse } from "./types";
import { useApiMutation } from "./useApiMutation";

export type TemplateQuery = { schoolId?: string | null; departmentId?: string | null; q?: string; limit?: number };

function cleanQuery(query: TemplateQuery) {
  return { schoolId: query.schoolId ?? undefined, departmentId: query.departmentId ?? undefined, q: query.q, limit: query.limit ?? 20 };
}

export function useTemplates(query: TemplateQuery) {
  const q = cleanQuery(query);
  return useQuery({
    queryKey: QK.templates({ schoolId: q.schoolId, departmentId: q.departmentId, q: q.q }),
    queryFn: () => api<TemplatesResponse>("/api/timetable-templates", { query: q }),
  });
}

export function useInfiniteTemplates(query: TemplateQuery) {
  const q = cleanQuery(query);
  return useInfiniteQuery({
    queryKey: ["templates", q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<TemplatesResponse>("/api/timetable-templates", { query: { ...q, cursor: pageParam } }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useCopyTemplate() {
  return useApiMutation<{ templateId: string; input: TemplateCopyInput }, UserTimetableResponse>(
    ({ templateId, input }) => api<UserTimetableResponse>(`/api/timetable-templates/${templateId}/copy`, { method: "POST", body: input }),
    [QK.userTimetables(), { predicate: QP.templates }],
  );
}

export function useCreateTemplate() {
  return useApiMutation<TemplateCreateInput, TemplateResponse>((body) => api<TemplateResponse>("/api/timetable-templates", { method: "POST", body }), [
    { predicate: QP.templates },
  ]);
}

export function usePublishTemplate(userTimetableId?: string) {
  return useApiMutation<{ title: string; description?: string; year?: number; term?: string }, TemplateResponse>(
    (body) => api<TemplateResponse>(`/api/user-timetables/${userTimetableId}/publish-as-template`, { method: "POST", body }),
    [{ predicate: QP.templates }],
  );
}

export function useUpdateTemplate(id?: string) {
  return useApiMutation<Partial<TemplateCreateInput>, TemplateResponse>((body) => api<TemplateResponse>(`/api/timetable-templates/${id}`, { method: "PATCH", body }), [
    ...(id ? [QK.template(id)] : []),
    { predicate: QP.templates },
  ]);
}

export function useDeleteTemplate(id?: string) {
  return useApiMutation<void, OkResponse>(() => api<OkResponse>(`/api/timetable-templates/${id}`, { method: "DELETE" }), [{ predicate: QP.templates }]);
}
