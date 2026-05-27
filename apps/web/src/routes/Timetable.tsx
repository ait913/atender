import { useMemo, useState } from "react";
import type { MeetingDto } from "@atender/shared";
import type { UserTimetableDto } from "@atender/shared";
import { useCreateUserTimetable, useMe, usePatchUserTimetable, usePublishTimetable, useSemesters, useUserTimetables } from "@/api/hooks";
import { DayList } from "@/components/timetable/DayList";
import { getTodayDayOfWeek } from "@/components/timetable/getTodayDayOfWeek";
import { MeetingCreateSheet } from "@/components/timetable/MeetingCreateSheet";
import { MeetingDetailSheet } from "@/components/timetable/MeetingDetailSheet";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { Button, Field, Input, PageTitle, Panel } from "@/components/ui";

const defaultSlots = [
  { periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false },
  { periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false },
  { periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870, isBreak: false },
  { periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970, isBreak: false },
  { periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070, isBreak: false },
];

function activeTimetable(timetables: UserTimetableDto[] | undefined, semesterId?: string | null) {
  return timetables?.find((item) => item.semesterId === semesterId) ?? timetables?.[0] ?? null;
}

export function Timetable() {
  const me = useMe();
  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const selected = activeTimetable(timetables.data?.userTimetables, me.data?.user.defaultSemesterId);
  const createTimetable = useCreateUserTimetable();
  const patchTimetable = usePatchUserTimetable(selected?.id);
  const publish = usePublishTimetable(selected?.id);
  const [sheet, setSheet] = useState<{ dayOfWeek: number; period: number } | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<MeetingDto | null>(null);
  const [createdTimetable, setCreatedTimetable] = useState<UserTimetableDto | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const today = useMemo(() => getTodayDayOfWeek(), []);
  const [activeDay, setActiveDay] = useState<number>(today);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const emptyTimetable = useMemo<UserTimetableDto | null>(() => {
    const semesterId = me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id;
    if (!semesterId) return null;
    return { id: "", userId: me.data?.user.id ?? "", semesterId, title: "自分の時間割", sourceTemplateId: null, daySlots: defaultSlots, courses: [], meetings: [], createdAt: "", updatedAt: "" };
  }, [me.data?.user.defaultSemesterId, me.data?.user.id, semesters.data?.semesters]);
  const display = selected ?? emptyTimetable;

  async function ensureTimetable() {
    if (selected || !emptyTimetable) return selected;
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
    ? display.courses.find((c) => c.id === detailMeeting.courseId) ?? null
    : null;
  const detailSlots = detailMeeting && display
    ? display.daySlots.filter(
        (s) =>
          s.periodIndex >= detailMeeting.startPeriodIndex &&
          s.periodIndex < detailMeeting.startPeriodIndex + detailMeeting.periodCount,
      )
    : [];

  async function handleEmptyCellClick(dayOfWeek: number, period: number) {
    const tt = await ensureTimetable();
    if (tt) setSheet({ dayOfWeek, period });
  }

  return (
    <div className="space-y-6">
      <PageTitle title="時間割">セルをタップして授業を追加できます。</PageTitle>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="公開タイトル" className="max-w-72">
          <Input value={publishTitle} onChange={(event) => setPublishTitle(event.currentTarget.value)} />
        </Field>
        <Button type="button" onClick={() => selected && publishTitle && publish.mutate({ title: publishTitle })} disabled={!selected || !publishTitle}>
          テンプレ公開
        </Button>
      </div>
      {display ? (
        <>
          <div className="md:hidden">
            <DayList
              timetable={display}
              activeDay={activeDay}
              today={today}
              viewMode={viewMode}
              onChangeDay={setActiveDay}
              onToggleViewMode={() => setViewMode((m) => (m === "day" ? "week" : "day"))}
              onMeetingClick={(meeting) => setDetailMeeting(meeting)}
              onEmptyCellClick={handleEmptyCellClick}
            />
          </div>
          <div className="hidden md:block">
            <TimetableGrid
              timetable={display}
              onMeetingClick={(meeting) => setDetailMeeting(meeting)}
              onEmptyCellClick={handleEmptyCellClick}
            />
          </div>
        </>
      ) : (
        <Panel>先に学期を作成してください。</Panel>
      )}
      <MeetingCreateSheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        timetable={selected ?? createdTimetable}
        initialDayOfWeek={sheet?.dayOfWeek ?? activeDay}
        initialPeriod={sheet?.period ?? 1}
      />
      <MeetingDetailSheet
        open={detailMeeting != null}
        onClose={() => setDetailMeeting(null)}
        meeting={detailMeeting}
        course={detailCourse}
        slots={detailSlots}
        pending={patchTimetable.isPending}
        onDelete={async () => {
          if (!detailMeeting) return;
          await removeMeeting(detailMeeting);
          setDetailMeeting(null);
        }}
      />
    </div>
  );
}
