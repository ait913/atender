import { Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingDto, UserTimetableDto } from "@atender/shared";
import { useCreateUserTimetable, useMe, usePatchUserTimetable, useSemesters, useUserTimetables } from "@/api/hooks";
import { HomeSemesterPicker } from "@/components/home/HomeSemesterPicker";
import { TimetableSettingsSheet } from "@/components/sheet/TimetableSettingsSheet";
import { getTodayDayOfWeek } from "@/components/timetable/getTodayDayOfWeek";
import { MeetingCreateSheet } from "@/components/timetable/MeetingCreateSheet";
import { MeetingDetailSheet } from "@/components/timetable/MeetingDetailSheet";
import { TimetableView, type TimetableEventInput } from "@/components/timetable/TimetableView";
import { Panel } from "@/components/ui";

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
  const patchTimetable = usePatchUserTimetable(selected?.id);
  const [sheet, setSheet] = useState<{ dayOfWeek: number; period: number } | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<MeetingDto | null>(null);
  const [createdTimetable, setCreatedTimetable] = useState<UserTimetableDto | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = useMemo(() => getTodayDayOfWeek(), []);
  const emptyTimetable = useMemo<UserTimetableDto | null>(() => {
    const fallbackSemesterId = semesterId ?? me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id;
    if (!fallbackSemesterId) return null;
    return { id: "", userId: me.data?.user.id ?? "", semesterId: fallbackSemesterId, title: "自分の時間割", sourceTemplateId: null, daySlots: defaultSlots, courses: [], meetings: [], createdAt: "", updatedAt: "" };
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

  async function removeMeeting(meeting: MeetingDto) {
    if (!selected) return;
    await patchTimetable.mutateAsync({
      courses: selected.courses.map((course) => ({ ...course, teacher: course.teacher ?? undefined, room: course.room ?? undefined, color: course.color ?? undefined, note: course.note ?? undefined })),
      meetings: selected.meetings.filter((item) => item.id !== meeting.id),
    });
  }

  const detailCourse = detailMeeting && display
    ? display.courses.find((course) => course.id === detailMeeting.courseId) ?? null
    : null;
  const detailSlots = detailMeeting && display
    ? display.daySlots.filter((slot) => slot.periodIndex >= detailMeeting.startPeriodIndex && slot.periodIndex < detailMeeting.startPeriodIndex + detailMeeting.periodCount)
    : [];

  async function handleEmptyCellClick(dayOfWeek: number, period: number) {
    const timetable = await ensureTimetable();
    if (timetable) setSheet({ dayOfWeek, period });
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
        events={display.meetings.map<TimetableEventInput>((m) => {
          const course = display.courses.find((c) => c.id === m.courseId);
          return {
            id: m.id,
            dayOfWeek: m.dayOfWeek,
            startPeriodIndex: m.startPeriodIndex,
            periodCount: m.periodCount,
            color: course?.color ?? "#F97316",
            title: course?.name ?? "授業",
            subtitle: course?.room ?? undefined,
          };
        })}
        onEventClick={(id) => {
          const meeting = display.meetings.find((m) => m.id === id);
          if (meeting) setDetailMeeting(meeting);
        }}
        onEmptyCellClick={handleEmptyCellClick}
      />
      <MeetingCreateSheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        timetable={selected ?? createdTimetable}
        initialDayOfWeek={sheet?.dayOfWeek ?? today}
        initialPeriod={sheet?.period ?? 1}
      />
      <MeetingDetailSheet
        open={detailMeeting != null}
        onClose={() => setDetailMeeting(null)}
        meeting={detailMeeting}
        course={detailCourse}
        slots={detailSlots}
        timetable={display}
        pending={patchTimetable.isPending}
        onDelete={async () => {
          if (!detailMeeting) return;
          await removeMeeting(detailMeeting);
          setDetailMeeting(null);
        }}
      />
      <TimetableSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} timetable={selected ?? createdTimetable} />
    </div>
  );
}
