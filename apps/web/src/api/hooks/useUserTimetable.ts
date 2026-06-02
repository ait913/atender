import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { CourseCreateInput, CourseResponse, CourseUpdateInput, MeetingBulkCreateInput, MeetingResponse, MeetingUpdateInput, TemplateResponse, UserTimetableCreateInput, UserTimetablePatchInput, UserTimetableResponse, UserTimetablesResponse } from "./types";

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
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });
}

export function useUpdateCourse(courseId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CourseUpdateInput) => api<CourseResponse>(`/api/courses/${courseId}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api<{ ok: true }>(`/api/courses/${courseId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
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
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
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
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });
}

export function useUpdateMeeting(meetingId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MeetingUpdateInput) => api<MeetingResponse>(`/api/meetings/${meetingId}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => api<{ ok: true }>(`/api/meetings/${meetingId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.userTimetables() });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["semesters"] });
    },
  });
}

export function usePublishTimetable(id?: string) {
  return useMutation({
    mutationFn: (body: { title: string; description?: string; year?: number; term?: string }) =>
      api<TemplateResponse>(`/api/user-timetables/${id}/publish-as-template`, { method: "POST", body }),
  });
}
