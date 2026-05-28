import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { CourseSuspensionCreateInput, CourseSuspensionDto } from "@atender/shared";

type ListRes = { suspensions: CourseSuspensionDto[] };
type CreateRes = { suspension: CourseSuspensionDto };

export function useCourseSuspensions(courseId: string | undefined) {
  return useQuery({
    queryKey: QK.courseSuspensions(courseId ?? ""),
    queryFn: () => api<ListRes>(`/api/courses/${courseId}/suspensions`),
    enabled: Boolean(courseId),
  });
}

export function useCreateCourseSuspension(courseId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CourseSuspensionCreateInput) =>
      api<CreateRes>(`/api/courses/${courseId}/suspensions`, { method: "POST", body }),
    onSuccess: () => {
      if (!courseId) return;
      queryClient.invalidateQueries({ queryKey: QK.courseSuspensions(courseId) });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteCourseSuspension(courseId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suspensionId: string) =>
      api<{ ok: true }>(`/api/courses/${courseId}/suspensions/${suspensionId}`, { method: "DELETE" }),
    onSuccess: () => {
      if (!courseId) return;
      queryClient.invalidateQueries({ queryKey: QK.courseSuspensions(courseId) });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
