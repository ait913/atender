import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK, QP } from "@/api/queryKeys";
import type {
  CourseCreateInput,
  CourseUpdateInput,
  DaySlotBulkReplaceInput,
  DaySlotUpdateInput,
  MeetingCreateInput,
  MeetingUpdateInput,
} from "@atender/shared";
import type {
  CourseResponse,
  DaySlotResponse,
  DaySlotsResponse,
  MeetingResponse,
  OkResponse,
  TemplateResponse,
  UserTimetableCreateInput,
  UserTimetablePatchInput,
  UserTimetableResponse,
  UserTimetablesResponse,
} from "./types";
import { useApiMutation } from "./useApiMutation";

export function useUserTimetables() {
  return useQuery({
    queryKey: QK.userTimetables(),
    queryFn: () => api<UserTimetablesResponse>("/api/user-timetables"),
  });
}

export function useUserTimetable(semesterId?: string | null) {
  return useQuery({
    queryKey: ["user-timetable-by-semester", semesterId ?? "default"],
    queryFn: async () => {
      const response = await api<UserTimetablesResponse>("/api/user-timetables");
      return { userTimetable: response.userTimetables.find((item) => (semesterId ? item.semesterId === semesterId : true)) ?? null };
    },
  });
}

export const useMeetings = useUserTimetable;
export const useCourses = useUserTimetable;

export function useCreateUserTimetable() {
  return useApiMutation<UserTimetableCreateInput, UserTimetableResponse>(
    (body) => api<UserTimetableResponse>("/api/user-timetables", { method: "POST", body }),
    [QK.userTimetables(), QK.me()],
  );
}

export function useUpdateUserTimetable(id?: string) {
  return useApiMutation<UserTimetablePatchInput, UserTimetableResponse>(
    (body) => api<UserTimetableResponse>(`/api/user-timetables/${id}`, { method: "PATCH", body }),
    id ? [QK.userTimetable(id), { predicate: QP.today }, { predicate: QP.stats }] : [{ predicate: QP.today }, { predicate: QP.stats }],
  );
}

export const usePatchUserTimetable = useUpdateUserTimetable;

export function useDeleteUserTimetable(id?: string) {
  return useApiMutation<void, OkResponse>(
    () => api<OkResponse>(`/api/user-timetables/${id}`, { method: "DELETE" }),
    [QK.userTimetables(), { predicate: QP.today }, { predicate: QP.stats }, QK.me()],
  );
}

export function usePublishTimetable(id?: string) {
  return useApiMutation<{ title: string; description?: string; year?: number; term?: string }, TemplateResponse>(
    (body) => api<TemplateResponse>(`/api/user-timetables/${id}/publish-as-template`, { method: "POST", body }),
    [{ predicate: QP.templates }],
  );
}

function timetableInvalidate(userTimetableId?: string, semesterId?: string | null) {
  return [
    ...(userTimetableId ? [QK.userTimetable(userTimetableId)] : [QK.userTimetables()]),
    { predicate: QP.today },
    ...(semesterId ? [QK.stats(semesterId)] : [{ predicate: QP.stats }]),
  ];
}

export function useCreateMeeting(userTimetableId?: string, semesterId?: string | null) {
  return useApiMutation<MeetingCreateInput, MeetingResponse>(
    (body) => api<MeetingResponse>("/api/meetings", { method: "POST", body }),
    timetableInvalidate(userTimetableId, semesterId),
  );
}

export function useUpdateMeeting(id?: string, userTimetableId?: string, semesterId?: string | null) {
  return useApiMutation<MeetingUpdateInput, MeetingResponse>(
    (body) => api<MeetingResponse>(`/api/meetings/${id}`, { method: "PATCH", body }),
    timetableInvalidate(userTimetableId, semesterId),
  );
}

export function useDeleteMeeting(id?: string, userTimetableId?: string, semesterId?: string | null) {
  return useApiMutation<void, OkResponse>(
    () => api<OkResponse>(`/api/meetings/${id}`, { method: "DELETE" }),
    timetableInvalidate(userTimetableId, semesterId),
  );
}

export function useCreateCourse(userTimetableId?: string) {
  return useApiMutation<CourseCreateInput, CourseResponse>(
    (body) => api<CourseResponse>("/api/courses", { method: "POST", body }),
    userTimetableId ? [QK.userTimetable(userTimetableId)] : [QK.userTimetables()],
  );
}

export function useUpdateCourse(id?: string, userTimetableId?: string, semesterId?: string | null) {
  return useApiMutation<CourseUpdateInput, CourseResponse>(
    (body) => api<CourseResponse>(`/api/courses/${id}`, { method: "PATCH", body }),
    timetableInvalidate(userTimetableId, semesterId),
  );
}

export function useDeleteCourse(id?: string, userTimetableId?: string, semesterId?: string | null, cascade = false) {
  return useApiMutation<void, OkResponse>(
    () => api<OkResponse>(`/api/courses/${id}`, { method: "DELETE", query: { cascade: cascade ? "true" : undefined } }),
    timetableInvalidate(userTimetableId, semesterId),
  );
}

export function useUpdateDaySlot(id?: string, userTimetableId?: string) {
  return useApiMutation<DaySlotUpdateInput, DaySlotResponse>(
    (body) => api<DaySlotResponse>(`/api/day-slots/${id}`, { method: "PATCH", body }),
    userTimetableId ? [QK.userTimetable(userTimetableId)] : [QK.userTimetables()],
  );
}

export function useBulkReplaceDaySlots(userTimetableId?: string) {
  return useApiMutation<DaySlotBulkReplaceInput, DaySlotsResponse>(
    (body) => api<DaySlotsResponse>(`/api/user-timetables/${userTimetableId}/day-slots/bulk-replace`, { method: "POST", body }),
    userTimetableId ? [QK.userTimetable(userTimetableId), { predicate: QP.today }] : [{ predicate: QP.today }],
  );
}
