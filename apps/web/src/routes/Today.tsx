import { useMemo, useState } from "react";
import type { OccurrenceDto } from "@atender/shared";
import { useMarkAllPresent, useMe, useToday } from "@/api/hooks";
import { AttendanceSheet } from "@/components/today/AttendanceSheet";
import { OccurrenceCard } from "@/components/today/OccurrenceCard";
import { StickyAction } from "@/components/today/StickyAction";
import { TodayMiniTimeline } from "@/components/today/TodayMiniTimeline";
import { Mascot } from "@/components/mascot/Mascot";
import { Button, EmptyState, Page, Skeleton, Toast } from "@/components/ui";
import { dayjs } from "@/lib/dayjs";
import { useNavigate } from "@tanstack/react-router";

function mergeOccurrences(occurrences: OccurrenceDto[]) {
  const sorted = [...occurrences].sort((a, b) => a.startMinute - b.startMinute);
  const groups: OccurrenceDto[][] = [];
  for (const occurrence of sorted) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    if (previous && previous.meetingId === occurrence.meetingId && previous.courseId === occurrence.courseId) last.push(occurrence);
    else groups.push([occurrence]);
  }
  return groups;
}

export function Today() {
  const navigate = useNavigate();
  const me = useMe();
  const today = useToday();
  const [toast, setToast] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const occurrences = today.data?.occurrences ?? [];
  const pendingCount = useMemo(() => occurrences.filter((occurrence) => occurrence.status == null).length, [occurrences]);
  const groups = useMemo(() => mergeOccurrences(occurrences), [occurrences]);
  const selected = occurrences.find((occurrence) => occurrence.id === selectedId) ?? null;
  const markAll = useMarkAllPresent((message) => setToast(message), me.data?.user.defaultSemesterId);
  const displayDate = today.data?.date ?? dayjs().tz("Asia/Tokyo").format("YYYY-MM-DD");
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${displayDate}T00:00:00+09:00`).getDay()];
  const formatted = `${dayjs(displayDate).format("M月D日")}(${weekday})`;

  return (
    <Page className="grid gap-5">
      <section className="flex items-center gap-3">
        <Mascot size="sm" />
        <div>
          <p className="text-2xl font-bold">{formatted}</p>
          <p className="text-sm text-fg-secondary">{displayDate}</p>
          <p className="mt-1 text-sm text-fg-secondary">こんにちは {me.data?.user.name ?? me.data?.user.email ?? "Atender"} さん</p>
        </div>
      </section>
      {today.isLoading ? <Skeleton className="h-40" /> : null}
      {!today.isLoading && occurrences.length === 0 ? (
        <EmptyState title="今日は授業がありません" action={<Button onClick={() => void navigate({ to: "/timetable" })}>時間割を見る</Button>} />
      ) : null}
      {occurrences.length > 0 ? (
        <>
          <TodayMiniTimeline occurrences={occurrences} date={displayDate} />
          <p className={`text-sm font-semibold ${pendingCount === 0 ? "text-accent-700" : "text-fg-secondary"}`}>
            {pendingCount === 0 ? "本日の記録は完了済" : `未記録 ${pendingCount} 件 / 全 ${occurrences.length} 件`}
          </p>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-fg-secondary">授業</h2>
            <div className="grid gap-3">
              {groups.map((group) => (
                <OccurrenceCard
                  key={group.map((item) => item.id).join("-")}
                  occurrences={group}
                  mergedTitle={group[0].courseName}
                  color={group[0].color}
                  teacher={group[0].teacher}
                  room={group[0].room}
                  onChipTap={setSelectedId}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
      <StickyAction pendingCount={pendingCount} disabled={markAll.isPending} onClick={() => markAll.mutate({ date: displayDate })} />
      <AttendanceSheet open={selectedId != null} occurrenceId={selectedId} currentStatus={selected?.status ?? null} onClose={() => setSelectedId(null)} />
      <Toast message={toast} variant="error" />
    </Page>
  );
}
