import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  BulkClearAttendanceInput,
  BulkClearAttendanceResponse,
  BulkMarkAttendanceInput,
  BulkMarkAttendanceResponse,
} from "./types";

function invalidateAttendanceViews(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["semesters"] });
  queryClient.invalidateQueries({ queryKey: ["stats"] });
  queryClient.invalidateQueries({ queryKey: ["day"] });
  queryClient.invalidateQueries({ queryKey: ["today"] });
  queryClient.invalidateQueries({ queryKey: ["timetable-suspensions"] });
}

export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkMarkAttendanceInput) =>
      api<BulkMarkAttendanceResponse>("/api/attendance/bulk", { method: "POST", body }),
    onSuccess: () => invalidateAttendanceViews(queryClient),
  });
}

export function useBulkClearAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkClearAttendanceInput) =>
      api<BulkClearAttendanceResponse>("/api/attendance/bulk-clear", { method: "POST", body }),
    onSuccess: () => invalidateAttendanceViews(queryClient),
  });
}
