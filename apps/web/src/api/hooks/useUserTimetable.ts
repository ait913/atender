import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { CourseCreateInput, CourseResponse, MeetingBulkCreateInput, TemplateResponse, UserTimetableCreateInput, UserTimetablePatchInput, UserTimetableResponse, UserTimetablesResponse } from "./types";

export function useUserTimetables() {
  return useQuery({
    queryKey: QK.userTimetables(),
    queryFn: () => api<UserTimetablesResponse>("/api/user-timetables"),
  });
}

export const useMeetings = useUserTimetables;

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CourseCreateInput) => api<CourseResponse>("/api/courses", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
    },
  });
}

export function useCreateUserTimetable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserTimetableCreateInput) => api<UserTimetableResponse>("/api/user-timetables", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
      queryClient.invalidateQueries({ queryKey: QK.me() });
    },
  });
}

export function usePatchUserTimetable(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserTimetablePatchInput) => api<UserTimetableResponse>(`/api/user-timetables/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
      queryClient.invalidateQueries({ queryKey: ["today"] });
    },
  });
}

export function useCreateMeetingsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MeetingBulkCreateInput) => api<UserTimetableResponse>("/api/meetings/bulk", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

export function usePublishTimetable(id?: string) {
  return useMutation({
    mutationFn: (body: { title: string; description?: string; year?: number; term?: string }) =>
      api<TemplateResponse>(`/api/user-timetables/${id}/publish-as-template`, { method: "POST", body }),
  });
}
