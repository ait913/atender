import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { AttendanceStatus } from "@atender/shared";
import { ApiError } from "@/api/client";
import { useMarkAllPresent, usePatchAttendance, useTodayOccurrences } from "@/api/hooks";
import { Toast } from "@/components/ui";
import { MainAttendanceCTA } from "@/components/today/MainAttendanceCTA";

export function SelfTodayCTA() {
  const navigate = useNavigate();
  const today = useTodayOccurrences();
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const markAll = useMarkAllPresent((message) => showToast(message));
  const patchAttendance = usePatchAttendance((message) => showToast(message));
  const occurrences = useMemo(() => [...(today.data?.occurrences ?? [])].sort((a, b) => a.startMinute - b.startMinute), [today.data?.occurrences]);
  const date = today.data?.date ?? dayjs().format("YYYY-MM-DD");

  useEffect(() => {
    if (today.error instanceof ApiError && today.error.status === 403 && today.error.code === "SETUP_REQUIRED") void navigate({ to: "/setup" });
  }, [navigate, today.error]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function changeStatus(occurrenceId: string, status: AttendanceStatus) {
    patchAttendance.mutate({ occurrenceId, input: { status } });
  }

  if (today.isLoading) return null;

  return occurrences.length === 0 ? null : (
    <>
      <MainAttendanceCTA
        occurrences={occurrences}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        onMarkAll={(status) => markAll.mutate({ date, status })}
        onChangeStatus={changeStatus}
        pending={markAll.isPending}
      />
      <Toast message={toast} />
    </>
  );
}
