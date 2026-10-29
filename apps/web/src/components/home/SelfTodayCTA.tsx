import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AttendanceStatus } from "@atender/shared";
import { ApiError } from "@/api/client";
import { useMarkAllPresent, usePatchAttendance, useTodayOccurrences } from "@/api/hooks";
import { Toast } from "@/components/ui";
import { MainAttendanceCTA } from "@/components/today/MainAttendanceCTA";
import * as SchoolClock from "@/lib/SchoolClock";
import * as TodayTimeline from "@/lib/TodayTimeline";
import { HomeAttendance, unrecordedCount } from "@/lib/TodayTimeline";
import { useNow } from "@/lib/useNow";

export function SelfTodayCTA() {
  const navigate = useNavigate();
  const today = useTodayOccurrences();
  const now = useNow(60_000);
  const [tileOpen, setTileOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const previous = useRef<{ date: string; unrecorded: number } | null>(null);
  const lastRefetchTick = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const markAll = useMarkAllPresent((message) => showToast(message));
  const patchAttendance = usePatchAttendance((message) => showToast(message));
  const occurrences = useMemo(() => [...(today.data?.occurrences ?? [])].sort((a, b) => a.startMinute - b.startMinute), [today.data?.occurrences]);
  const date = today.data?.date;
  const unrecorded = unrecordedCount(occurrences);
  const state = TodayTimeline.state(occurrences, SchoolClock.nowMinute(now));

  useEffect(() => {
    if (date == null) return;
    if (previous.current?.date !== date) {
      setTileOpen(HomeAttendance.defaultExpanded(occurrences));
    } else if (previous.current.unrecorded > 0 && unrecorded === 0) {
      setTileOpen(false);
    }
    previous.current = { date, unrecorded };
  }, [date, occurrences, unrecorded]);

  useEffect(() => {
    if (!today.data || today.isFetching || !TodayTimeline.isStale(date, now)) return;
    // 同じ時計の更新では再試行せず、古い日付の応答による連続取得を防ぐ。
    if (lastRefetchTick.current === now.getTime()) return;
    lastRefetchTick.current = now.getTime();
    void today.refetch();
  }, [date, now, today.data, today.isFetching, today.refetch]);

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
        tileOpen={tileOpen}
        onTileOpenChange={setTileOpen}
        detailOpen={detailOpen}
        onToggleDetail={() => setDetailOpen((value) => !value)}
        state={state}
        onMarkAll={(status) => markAll.mutate({ date: date ?? SchoolClock.todayString(now), status })}
        onChangeStatus={changeStatus}
        pending={markAll.isPending}
      />
      <Toast message={toast} />
    </>
  );
}
