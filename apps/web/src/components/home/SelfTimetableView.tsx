import { Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingDto, UserTimetableDto } from "@atender/shared";
import { useCreateUserTimetable, useDeleteMeeting, useMe, useSemesters, useUserTimetables } from "@/api/hooks";
import { HomeSemesterPicker } from "@/components/home/HomeSemesterPicker";
import { TimetableSettingsSheet } from "@/components/sheet/TimetableSettingsSheet";
import { displayDowToJs, jsDowToDisplay, resolveDisplayDays } from "@/components/timetable/dayConvention";
import { getTodayDayOfWeek } from "@/components/timetable/getTodayDayOfWeek";
import { MeetingDetailSheet } from "@/components/timetable/MeetingDetailSheet";
import { MeetingEditModal } from "@/components/timetable/MeetingEditModal";
import { TimetableView, type TimetableEventInput } from "@/components/timetable/TimetableView";
import { Panel, Skeleton, TimetableGridSkeleton } from "@/components/ui";

const defaultSlots = [
  { periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false },
  { periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false },
  { periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870, isBreak: false },
  { periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970, isBreak: false },
  { periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070, isBreak: false },
];

function activeTimetable(timetables: UserTimetableDto[] | undefined, semesterId?: string | null) {
  return timetables?.find((item) => item.semesterId === semesterId) ?? null;
}

export function SelfTimetableView({ semesterId, onSemesterChange }: { semesterId: string | null; onSemesterChange: (id: string) => void }) {
  const me = useMe();
  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const selected = activeTimetable(timetables.data?.userTimetables, semesterId);
  const createTimetable = useCreateUserTimetable();
  const deleteMeeting = useDeleteMeeting();
  const [sheet, setSheet] = useState<{ dayOfWeek: number; period: number } | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<MeetingDto | null>(null);
  const [editMeeting, setEditMeeting] = useState<MeetingDto | null>(null);
  const [createdTimetable, setCreatedTimetable] = useState<UserTimetableDto | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = useMemo(() => getTodayDayOfWeek(), []);
  const emptyTimetable = useMemo<UserTimetableDto | null>(() => {
    const fallbackSemesterId = semesterId ?? me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id;
    if (!fallbackSemesterId) return null;
    return { id: "", userId: me.data?.user.id ?? "", semesterId: fallbackSemesterId, title: "自分の時間割", sourceTemplateId: null, daysOfWeek: [1, 2, 3, 4, 5], daySlots: defaultSlots, courses: [], meetings: [], createdAt: "", updatedAt: "" };
  }, [me.data?.user.defaultSemesterId, me.data?.user.id, semesterId, semesters.data?.semesters]);
  const display = selected ?? createdTimetable ?? emptyTimetable;

  async function ensureTimetable() {
    if (selected || createdTimetable || !emptyTimetable) return selected ?? createdTimetable;
    const created = await createTimetable.mutateAsync({
      semesterId: emptyTimetable.semesterId,
      title: "自分の時間割",
      daySlots: defaultSlots,
      courses: [],
      meetings: [],
    });
    setCreatedTimetable(created.userTimetable);
    return created.userTimetable;
  }

  const detailCourse = detailMeeting && display
    ? display.courses.find((course) => course.id === detailMeeting.courseId) ?? null
    : null;
  const detailSlots = detailMeeting && display
    ? display.daySlots.filter((slot) => slot.periodIndex >= detailMeeting.startPeriodIndex && slot.periodIndex < detailMeeting.startPeriodIndex + detailMeeting.periodCount)
    : [];

  async function handleEmptyCellClick(displayDow: number, period: number) {
    const timetable = await ensureTimetable();
    if (timetable) setSheet({ dayOfWeek: displayDowToJs(displayDow), period });
  }

  if (me.isLoading || semesters.isLoading || timetables.isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <Skeleton width="8rem" height="1.25rem" radius="9999px" />
          <Skeleton circle height="2.25rem" />
        </div>
        <TimetableGridSkeleton days={5} rows={5} />
      </div>
    );
  }
  if (!display) return <Panel>先に学期を作成してください。</Panel>;

  return (
    <div className="space-y-3">
      <HomeSemesterPicker
        semesterId={semesterId}
        onChange={onSemesterChange}
        trailing={
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="時間割の設定"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-fg-primary/8 text-fg-secondary transition hover:bg-fg-primary/14 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            <Settings className="h-4 w-4" strokeWidth={2.25} />
          </button>
        }
      />
      <TimetableView
        daySlots={display.daySlots}
        days={resolveDisplayDays(display)}
        events={display.meetings.map<TimetableEventInput>((m) => {
          const course = display.courses.find((c) => c.id === m.courseId);
          return {
            id: m.id,
            dayOfWeek: jsDowToDisplay(m.dayOfWeek),
            startPeriodIndex: m.startPeriodIndex,
            periodCount: m.periodCount,
            color: course?.color ?? "#F97316",
            title: course?.name ?? "授業",
            subtitle: m.room ?? undefined,
            mergeKey: m.courseId,
          };
        })}
        onEventClick={(id) => {
          const meeting = display.meetings.find((m) => m.id === id);
          if (meeting) setDetailMeeting(meeting);
        }}
        onEmptyCellClick={handleEmptyCellClick}
      />
      {(selected ?? createdTimetable) ? (
        <MeetingEditModal
          open={sheet != null}
          onClose={() => setSheet(null)}
          timetable={(selected ?? createdTimetable)!}
          mode="create"
          initialDayOfWeek={sheet?.dayOfWeek ?? today}
          initialPeriod={sheet?.period ?? 1}
        />
      ) : null}
      <MeetingDetailSheet
        open={detailMeeting != null}
        onClose={() => setDetailMeeting(null)}
        meeting={detailMeeting}
        course={detailCourse}
        slots={detailSlots}
        pending={deleteMeeting.isPending}
        onEdit={() => {
          setEditMeeting(detailMeeting);
          setDetailMeeting(null);
        }}
        onDelete={async () => {
          if (!detailMeeting) return;
          await deleteMeeting.mutateAsync(detailMeeting.id);
          setDetailMeeting(null);
        }}
      />
      {display ? (
        <MeetingEditModal
          open={editMeeting != null}
          onClose={() => setEditMeeting(null)}
          timetable={display}
          mode="edit"
          meeting={editMeeting}
        />
      ) : null}
      <TimetableSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} timetable={selected ?? createdTimetable} />
    </div>
  );
}
