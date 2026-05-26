import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { AttendanceStatus } from "@atender/shared";
import { ApiError } from "@/api/client";
import { useMarkAllPresent, useMe, usePatchAttendance, useTodayOccurrences } from "@/api/hooks";
import { Button, EmptyState, Toast } from "@/components/ui";
import { MainAttendanceCTA } from "./MainAttendanceCTA";
import { TimetableScroll } from "./TimetableScroll";
import { TodayGreeting } from "./TodayGreeting";

export function Today() {
  const navigate = useNavigate();
  const me = useMe();
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

  if (today.isLoading) {
    return <div className="space-y-4">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-md bg-bg-muted" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <TodayGreeting me={me.data} date={date} />
      {occurrences.length === 0 ? (
        <EmptyState title="今日は授業がありません" action={<Button type="button" onClick={() => void navigate({ to: "/timetable" })}>時間割を見る</Button>} />
      ) : (
        <>
          <MainAttendanceCTA
            occurrences={occurrences}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            onMarkAll={() => markAll.mutate({ date })}
            onChangeStatus={changeStatus}
            pending={markAll.isPending}
          />
          <TimetableScroll occurrences={occurrences} />
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}
