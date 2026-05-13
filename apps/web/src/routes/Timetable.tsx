import { FormEvent, useMemo, useState } from "react";
import { Fragment } from "react";
import type { CourseDto, MeetingDto, UserTimetableDto } from "@atender/shared";
import { useCreateUserTimetable, useMe, usePatchUserTimetable, usePublishTimetable, useSemesters, useUserTimetables } from "@/api/hooks";
import { Button, Field, PageTitle, Panel, Select } from "@/components/ui";

const days = ["月", "火", "水", "木", "金"];
const colors = ["#10b981", "#60a5fa", "#f4f1e8", "#f472b6", "#a7f3d0"];
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
  const [form, setForm] = useState({ name: "", teacher: "", room: "", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1, totalSessions: 15 });
  const [publishTitle, setPublishTitle] = useState("");
  const gridRows = selected?.daySlots.length ? selected.daySlots : defaultSlots;
  const courseById = useMemo(() => new Map((selected?.courses ?? []).map((course) => [course.id, course])), [selected]);

  async function addCourse(event: FormEvent) {
    event.preventDefault();
    const tempId = `course_${Date.now()}`;
    if (!selected) {
      const semesterId = me.data?.user.defaultSemesterId ?? semesters.data?.semesters[0]?.id;
      if (!semesterId) return;
      await createTimetable.mutateAsync({
        semesterId,
        title: "自分の時間割",
        daySlots: defaultSlots,
        courses: [{ tempId, name: form.name, teacher: form.teacher || undefined, room: form.room || undefined, color: colors[0], totalSessions: form.totalSessions }],
        meetings: [{ courseTempId: tempId, dayOfWeek: form.dayOfWeek, startPeriodIndex: form.startPeriodIndex, periodCount: form.periodCount }],
      });
      setForm({ ...form, name: "", teacher: "", room: "" });
      return;
    }
    await patchTimetable.mutateAsync({
      courses: [
        ...selected.courses.map((course) => ({ ...course, teacher: course.teacher ?? undefined, room: course.room ?? undefined, color: course.color ?? undefined, note: course.note ?? undefined })),
        { tempId, name: form.name, teacher: form.teacher || undefined, room: form.room || undefined, color: colors[selected.courses.length % colors.length], totalSessions: form.totalSessions },
      ],
      meetings: [
        ...selected.meetings,
        { courseTempId: tempId, dayOfWeek: form.dayOfWeek, startPeriodIndex: form.startPeriodIndex, periodCount: form.periodCount },
      ],
    });
    setForm({ ...form, name: "", teacher: "", room: "" });
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
      <PageTitle title="Timetable::">自分の時間割エディタ</PageTitle>
      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="max-w-56" value={selected?.semesterId ?? me.data?.user.defaultSemesterId ?? ""} onChange={() => undefined}>
          {(semesters.data?.semesters ?? []).map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
        </Select>
        <Button type="button" onClick={() => setForm({ ...form, name: "新規授業" })}>+ 新規授業</Button>
        <Button type="button" onClick={() => selected && publishTitle && publish.mutate({ title: publishTitle })} disabled={!selected || !publishTitle}>テンプレ公開</Button>
        <Field className="max-w-64" placeholder="公開タイトル" value={publishTitle} onChange={(event) => setPublishTitle(event.currentTarget.value)} />
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[72px_repeat(5,minmax(110px,1fr))] border border-white/12 text-sm">
          <div className="border-b border-r border-white/12 p-3" />
          {days.map((day) => <div key={day} className="border-b border-r border-white/12 p-3 text-center font-black">{day}</div>)}
          {gridRows.map((slot) => (
            <Fragment key={slot.periodIndex}>
              <div key={`slot-${slot.periodIndex}`} className="border-b border-r border-white/12 p-3 font-black">{slot.label}</div>
              {days.map((day, index) => {
                const meeting = selected?.meetings.find((item) => item.dayOfWeek === index + 1 && item.startPeriodIndex <= slot.periodIndex && item.startPeriodIndex + item.periodCount > slot.periodIndex);
                const course = meeting ? courseById.get(meeting.courseId) : null;
                return (
                  <button key={`${day}-${slot.periodIndex}`} className="min-h-20 border-b border-r border-white/12 p-2 text-left hover:bg-white/8" onClick={() => meeting && removeMeeting(meeting)}>
                    {course ? <><strong>{course.name}</strong><br /><span className="text-white/58">{course.teacher ?? ""}</span></> : null}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <Panel className="mt-5">
        <form className="grid gap-3 md:grid-cols-6" onSubmit={addCourse}>
          <Field placeholder="授業名" value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} required />
          <Field placeholder="先生" value={form.teacher} onChange={(event) => setForm({ ...form, teacher: event.currentTarget.value })} />
          <Field placeholder="教室" value={form.room} onChange={(event) => setForm({ ...form, room: event.currentTarget.value })} />
          <Select value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: Number(event.currentTarget.value) })}>{days.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</Select>
          <Field type="number" min={1} max={5} value={form.startPeriodIndex} onChange={(event) => setForm({ ...form, startPeriodIndex: Number(event.currentTarget.value) })} />
          <Button type="submit" variant="primary">追加</Button>
        </form>
      </Panel>
    </div>
  );
}
