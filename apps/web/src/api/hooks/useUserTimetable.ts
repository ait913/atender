import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { TemplateResponse, UserTimetableCreateInput, UserTimetablePatchInput, UserTimetableResponse, UserTimetablesResponse } from "./types";

export function useUserTimetables() {
  return useQuery({
    queryKey: ["user-timetables"],
    queryFn: () => api<UserTimetablesResponse>("/api/user-timetables"),
  });
}

export const useMeetings = useUserTimetables;

export function useCreateUserTimetable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserTimetableCreateInput) => api<UserTimetableResponse>("/api/user-timetables", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-timetables"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function usePatchUserTimetable(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserTimetablePatchInput) => api<UserTimetableResponse>(`/api/user-timetables/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-timetables"] });
      queryClient.invalidateQueries({ queryKey: ["today"] });
    },
  });
}

export function usePublishTimetable(id?: string) {
  return useMutation({
    mutationFn: (body: { title: string; description?: string; year?: number; term?: string }) =>
      api<TemplateResponse>(`/api/user-timetables/${id}/publish-as-template`, { method: "POST", body }),
  });
}
