import { useEffect, useState } from "react";
import type { CourseDto, DaySlotDto, MeetingDto, UserTimetableDto } from "@atender/shared";
import { usePatchUserTimetable } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Select, Textarea, minutesToTime } from "@/components/ui";
import { PeriodChips } from "./PeriodChips";

const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];
const colors = ["#10b981", "#60a5fa", "#f472b6", "#8b5cf6", "#f59e0b"];

function hexWithAlpha(hex: string, alphaHex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alphaHex}`;
  return hex;
}

export function MeetingDetailSheet({
  open,
  onClose,
  meeting,
  course,
  slots,
  timetable,
  onDelete,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  meeting: MeetingDto | null;
  course: CourseDto | null;
  slots: DaySlotDto[];
  timetable: UserTimetableDto | null;
  onDelete: () => void;
  pending?: boolean;
}) {
  const patch = usePatchUserTimetable(timetable?.id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", teacher: "", room: "", color: colors[0]!, note: "", dayOfWeek: 1, periods: [1] as number[] });

  useEffect(() => {
    if (!open) setEditing(false);
    if (course && meeting) {
      const startP = meeting.startPeriodIndex;
      const periods: number[] = [];
      for (let i = 0; i < meeting.periodCount; i++) periods.push(startP + i);
      setForm({
        name: course.name,
        teacher: course.teacher ?? "",
        room: course.room ?? "",
        color: course.color ?? colors[0]!,
        note: course.note ?? "",
        dayOfWeek: meeting.dayOfWeek,
        periods,
      });
    }
  }, [open, course, meeting]);

  const first = slots[0];
  const last = slots[slots.length - 1];
  const color = (editing ? form.color : course?.color) ?? "#F97316";
  const bg = hexWithAlpha(color, "26");
  const periodLabel = first && last && slots.length > 1
    ? `${first.periodIndex}-${last.periodIndex}`
    : first
      ? String(first.periodIndex)
      : "";

  async function handleSave() {
    if (!timetable || !course || !meeting) return;
    const nextCourses = timetable.courses.map((c) =>
      c.id === course.id
        ? {
            id: c.id,
            name: form.name.trim() || c.name,
            teacher: form.teacher.trim() || undefined,
            room: form.room.trim() || undefined,
            color: form.color,
            totalSessions: c.totalSessions,
            note: form.note.trim() || undefined,
          }
        : { ...c, teacher: c.teacher ?? undefined, room: c.room ?? undefined, color: c.color ?? undefined, note: c.note ?? undefined },
    );

    const sortedPeriods = [...form.periods].sort((a, b) => a - b);
    const newStart = sortedPeriods[0] ?? meeting.startPeriodIndex;
    let newCount = 1;
    for (let i = 1; i < sortedPeriods.length; i++) {
      if (sortedPeriods[i] === sortedPeriods[i - 1]! + 1) newCount++;
      else break;
    }
    const nextMeetings = timetable.meetings.map((m) =>
      m.id === meeting.id
        ? { id: m.id, courseId: m.courseId, dayOfWeek: form.dayOfWeek, startPeriodIndex: newStart, periodCount: newCount }
        : { id: m.id, courseId: m.courseId, dayOfWeek: m.dayOfWeek, startPeriodIndex: m.startPeriodIndex, periodCount: m.periodCount },
    );
    await patch.mutateAsync({ courses: nextCourses, meetings: nextMeetings });
    setEditing(false);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "授業を編集" : "授業の詳細"}
      footer={
        course && meeting ? (
          editing ? (
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>戻る</Button>
              <Button type="button" variant="primary" disabled={patch.isPending} onClick={() => void handleSave()}>保存</Button>
            </div>
          ) : (
            <div className="flex justify-between gap-3">
              <Button type="button" variant="destructive" disabled={pending} onClick={onDelete}>削除</Button>
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={onClose}>閉じる</Button>
                <Button type="button" variant="primary" onClick={() => setEditing(true)}>編集</Button>
              </div>
            </div>
          )
        ) : undefined
      }
    >
      {course && meeting && first && last ? (
        editing ? (
          <div className="space-y-4">
            <Field label="授業名" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="先生"><Input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.currentTarget.value })} /></Field>
              <Field label="教室"><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.currentTarget.value })} /></Field>
            </div>
            <Field label="曜日">
              <Select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.currentTarget.value) })}>
                {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => <option key={day} value={index}>{day}</option>)}
              </Select>
            </Field>
            <Field label="時限 (複数選択で連続コマ)">
              <PeriodChips value={form.periods} onChange={(periods) => setForm({ ...form, periods })} periodCount={timetable?.daySlots.length ?? 5} />
            </Field>
            <Field label="色">
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`色 ${c}`}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`h-10 w-10 rounded-full transition active:scale-95 ${form.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-bg-elevated" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Field>
            <Field label="メモ"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} /></Field>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-3xl p-5" style={{ background: bg }}>
              <div className="flex items-stretch gap-5">
                <div className="flex flex-shrink-0 flex-col items-center justify-center">
                  <span className={`font-black leading-none tracking-tight ${periodLabel.length > 2 ? "text-5xl" : "text-7xl"}`} style={{ color }}>{periodLabel}</span>
                  <span className="mt-1.5 text-xs font-bold uppercase tracking-widest opacity-80" style={{ color }}>限</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 pl-5" style={{ borderLeft: `1px solid ${hexWithAlpha(color, "44")}` }}>
                  <h3 className="text-2xl font-black leading-tight text-fg-primary">{course.name}</h3>
                  <p className="text-sm font-semibold" style={{ color }}>
                    {dayLabels[meeting.dayOfWeek]}曜日 · {minutesToTime(first.startMinute)} – {minutesToTime(last.endMinute)}
                  </p>
                </div>
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="教室" value={course.room} />
              <Row label="先生" value={course.teacher} />
              <Row label="メモ" value={course.note} />
            </dl>
          </div>
        )
      ) : null}
    </BottomSheet>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg-primary/4 px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">{label}</dt>
      <dd className="text-base font-medium text-fg-primary">{value ?? "—"}</dd>
    </div>
  );
}
