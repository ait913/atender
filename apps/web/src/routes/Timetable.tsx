import { useMemo, useState } from "react";
import type { MeetingDto } from "@atender/shared";
import type { UserTimetableDto } from "@atender/shared";
import { useCreateUserTimetable, useMe, usePatchUserTimetable, usePublishTimetable, useSemesters, useUserTimetables } from "@/api/hooks";
import { MeetingCreateSheet } from "@/components/timetable/MeetingCreateSheet";
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
  const params = new URLSearchParams(window.location.search);
  const urlSemesterId = params.get("semesterId");
  const me = useMe();
  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const selected = activeTimetable(timetables.data?.userTimetables, me.data?.user.defaultSemesterId);
  const createTimetable = useCreateUserTimetable();
  const patchTimetable = usePatchUserTimetable(selected?.id);
  const publish = usePublishTimetable(selected?.id);
  const [sheet, setSheet] = useState<{ dayOfWeek: number; period: number } | null>(null);
  const [createdTimetable, setCreatedTimetable] = useState<UserTimetableDto | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
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

  return (
    <div>
      <PageTitle title="時間割">セルをタップして授業を追加できます。</PageTitle>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="公開タイトル" className="max-w-72"><Input value={publishTitle} onChange={(event) => setPublishTitle(event.currentTarget.value)} /></Field>
        <Button type="button" onClick={() => selected && publishTitle && publish.mutate({ title: publishTitle })} disabled={!selected || !publishTitle}>テンプレ公開</Button>
      </div>
      {display ? (
        <TimetableGrid
          timetable={display}
          onMeetingClick={(meeting) => void removeMeeting(meeting)}
          onEmptyCellClick={async (dayOfWeek, period) => {
            const timetable = await ensureTimetable();
            if (timetable) setSheet({ dayOfWeek, period });
          }}
        />
      ) : (
        <Panel>先に学期を作成してください。</Panel>
      )}
      <MeetingCreateSheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        timetable={selected ?? createdTimetable}
        initialDayOfWeek={sheet?.dayOfWeek ?? 1}
        initialPeriod={sheet?.period ?? 1}
      />
    </div>
  );
}
