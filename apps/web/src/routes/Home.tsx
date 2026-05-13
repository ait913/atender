import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { ATTENDANCE_STATUS, type AttendanceStatus, type OccurrenceDto } from "@atender/shared";
import { ApiError } from "@/api/client";
import { useMarkAllPresent, useMe, usePatchAttendance, useTodayOccurrences } from "@/api/hooks";
import { Button, Mascot, minutesToTime, PageTitle, Panel, statusLabels, Toast } from "@/components/ui";

function OccurrenceCard({ occurrence, onChange }: { occurrence: OccurrenceDto; onChange: (status: AttendanceStatus) => void }) {
  const [open, setOpen] = useState(occurrence.status == null);
  const showAll = open || occurrence.status == null;
  return (
    <Panel className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white/62">{occurrence.periodIndex}限 {minutesToTime(occurrence.startMinute)}-{minutesToTime(occurrence.endMinute)}</p>
          <h2 className="mt-1 text-xl font-black">{occurrence.courseName}</h2>
          <p className="mt-1 text-sm text-white/62">先生: {occurrence.teacher ?? "-"} / 教室: {occurrence.room ?? "-"}</p>
        </div>
        {occurrence.color ? <span className="mt-1 h-4 w-4 rounded-full" style={{ background: occurrence.color }} /> : null}
      </div>
      {showAll ? (
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE_STATUS.map((status) => (
            <button
              key={status}
              className={`rounded-full border px-3 py-2 text-xs font-black ${occurrence.status === status ? "border-emerald-300 bg-emerald-500 text-black" : "border-white/16 text-white/78"}`}
              onClick={() => { onChange(status); setOpen(false); }}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-emerald-300 bg-emerald-500 px-3 py-2 text-xs font-black text-black">● {occurrence.status != null ? statusLabels[occurrence.status] : null}</span>
          <button className="text-xs font-bold underline underline-offset-4" onClick={() => setOpen(true)}>変更</button>
        </div>
      )}
    </Panel>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  const me = useMe();
  const today = useTodayOccurrences();
  const markAll = useMarkAllPresent((message) => setToast(message));
  const patch = usePatchAttendance((message) => setToast(message));
  const occurrences = today.data?.occurrences ?? [];
  const pendingCount = useMemo(() => occurrences.filter((occurrence) => occurrence.status == null).length, [occurrences]);
  const displayDate = today.data?.date ?? dayjs().format("YYYY-MM-DD");

  useEffect(() => {
    if (today.error instanceof ApiError && today.error.status === 403 && today.error.code === "SETUP_REQUIRED") {
      void navigate({ to: "/setup" });
    }
  }, [navigate, today.error]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  return (
    <div className="pb-20 md:pb-0">
      <div className="grid gap-6 md:grid-cols-[1fr_190px] md:items-end">
        <PageTitle title="Home::">
          {displayDate}　こんにちは、{me.data?.user.name ?? me.data?.user.email ?? "Atender"} さん
        </PageTitle>
        <Mascot className="mx-auto h-32 w-32 md:h-44 md:w-44" />
      </div>
      {occurrences.length === 0 && !today.isLoading ? (
        <Panel className="flex min-h-72 flex-col items-center justify-center text-center">
          <Mascot className="h-40 w-40" />
          <p className="mt-4 text-lg font-black">今日は授業がありません</p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {occurrences.map((occurrence) => (
            <OccurrenceCard
              key={occurrence.id}
              occurrence={occurrence}
              onChange={(status) => patch.mutate({ occurrenceId: occurrence.id, input: { status } })}
            />
          ))}
        </div>
      )}
      <div className="fixed inset-x-0 bottom-[50px] z-30 border-t border-white/10 bg-[#02040a]/95 p-4 backdrop-blur md:sticky md:bottom-0 md:mt-8 md:bg-transparent md:px-0">
        <div className="mx-auto max-w-6xl">
          <Button
            type="button"
            variant="primary"
            className="w-full text-base"
            disabled={pendingCount === 0 || markAll.isPending}
            onClick={() => {
              showToast("保存しています");
              markAll.mutate({ date: today.data?.date });
            }}
          >
            {pendingCount === 0 ? "本日の記録は完了済" : `すべて出席にする (${pendingCount} 件)`}
          </Button>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
