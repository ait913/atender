import { useEffect, useState } from "react";
import type { CourseDto } from "@atender/shared";
import { useCreateCourse, useMe, useUpdateCourse } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, NumberStepper, Textarea, Toggle } from "@/components/ui";
import * as CourseRuleLogic from "@/lib/CourseRuleLogic";

const colors = ["#12B172", "#56D8C3", "#568CFC", "#A978FA", "#FC6ABF", "#FD728E"];

type CourseEditModalProps = {
  open: boolean;
  onClose: () => void;
  timetableId: string;
  course?: CourseDto | null;
  stackLevel?: 1 | 2;
  onSaved?: (course: CourseDto) => void;
};

export function CourseEditModal({ open, onClose, timetableId, course, stackLevel = 1, onSaved }: CourseEditModalProps) {
  const me = useMe();
  const userRate = me.data?.user.requiredAttendanceRate ?? 70;
  const [rateOn, setRateOn] = useState(false);
  const [maxOn, setMaxOn] = useState(false);
  const [tardyOn, setTardyOn] = useState(false);
  const [rate, setRate] = useState(userRate);
  const [maxAbsences, setMaxAbsences] = useState(5);
  const [tardiesPerAbsence, setTardiesPerAbsence] = useState(3);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse(course?.id);
  const [form, setForm] = useState({
    name: "",
    teacher: "",
    color: colors[0]!,
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: course?.name ?? "",
      teacher: course?.teacher ?? "",
      color: course?.color ?? colors[0]!,
      note: course?.note ?? "",
    });
    setRateOn(course?.requiredAttendanceRate != null);
    setMaxOn(course?.maxAbsences != null);
    setTardyOn(course?.tardiesPerAbsence != null);
    setRate(course?.requiredAttendanceRate ?? userRate);
    setMaxAbsences(course?.maxAbsences ?? 5);
    setTardiesPerAbsence(course?.tardiesPerAbsence ?? 3);
  }, [course, open, userRate]);

  const isPending = createCourse.isPending || updateCourse.isPending;
  const canSave = form.name.trim().length > 0 && !isPending;

  async function handleSave() {
    if (!canSave) return;
    if (course) {
      const result = await updateCourse.mutateAsync({
        name: form.name.trim(),
        teacher: form.teacher.trim() ? form.teacher.trim() : null,
        color: form.color,
        note: form.note.trim() ? form.note.trim() : null,
        requiredAttendanceRate: rateOn ? rate : null,
        maxAbsences: maxOn ? maxAbsences : null,
        tardiesPerAbsence: tardyOn ? tardiesPerAbsence : null,
      });
      onSaved?.(result.course);
      onClose();
      return;
    }
    const result = await createCourse.mutateAsync({
      userTimetableId: timetableId,
      name: form.name.trim(),
      teacher: form.teacher.trim() || undefined,
      color: form.color,
      note: form.note.trim() || undefined,
      ...(rateOn ? { requiredAttendanceRate: rate } : {}),
      ...(maxOn ? { maxAbsences } : {}),
      ...(tardyOn ? { tardiesPerAbsence } : {}),
    });
    onSaved?.(result.course);
    onClose();
  }

  const error = createCourse.error ?? updateCourse.error;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={course ? "科目を編集" : "科目を追加"}
      stackLevel={stackLevel}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="primary" disabled={!canSave} onClick={() => void handleSave()}>保存</Button>
        </div>
      }
    >
      <Field label="科目名" required>
        <Input value={form.name} maxLength={100} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
      </Field>
      <Field label="先生">
        <Input value={form.teacher} maxLength={50} onChange={(event) => setForm({ ...form, teacher: event.currentTarget.value })} />
      </Field>
      <Field label="色">
        <div className="flex flex-wrap items-center gap-2">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`色 ${color}`}
              onClick={() => setForm({ ...form, color })}
              className={`h-10 w-10 rounded-full transition active:scale-95 ${form.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-bg-elevated" : ""}`}
              style={{ background: color }}
            />
          ))}
          <Input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.currentTarget.value })} className="h-10 w-16 p-1" />
        </div>
      </Field>
      <Field label="メモ">
        <Textarea value={form.note} maxLength={500} onChange={(event) => setForm({ ...form, note: event.currentTarget.value })} />
      </Field>
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-fg-tertiary">出席の基準</h3>
        <div className="divide-y divide-border-default rounded-md bg-bg-muted p-3">
          <div className="space-y-2 pb-3">
            <Toggle
              checked={rateOn}
              onChange={(next) => {
                setRateOn(next);
                if (next && course?.requiredAttendanceRate == null) setRate(userRate);
              }}
              label="この科目の必要出席率を変える"
              data-testid="course-rule-rate-toggle"
            />
            {rateOn ? (
              <div className="flex items-center gap-2 text-sm">
                <NumberStepper value={rate} onChange={setRate} min={1} max={100} label="必要出席率" />
                <span>%</span>
              </div>
            ) : null}
          </div>
          <div className="space-y-2 py-3">
            <Toggle checked={maxOn} onChange={setMaxOn} label="欠席できる回数の上限を決める" data-testid="course-rule-max-absences-toggle" />
            {maxOn ? (
              <div className="flex items-center gap-2 text-sm">
                <NumberStepper value={maxAbsences} onChange={setMaxAbsences} min={0} max={30} label="欠席上限" />
                <span>回まで</span>
              </div>
            ) : null}
          </div>
          <div className="space-y-2 pt-3">
            <Toggle checked={tardyOn} onChange={setTardyOn} label="遅刻・早退を欠席に換算する" data-testid="course-rule-tardy-toggle" />
            {tardyOn ? (
              <div className="flex items-center gap-2 text-sm">
                <NumberStepper value={tardiesPerAbsence} onChange={setTardiesPerAbsence} min={1} max={10} label="遅刻・早退の換算" />
                <span>回で欠席 1 回</span>
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-fg-tertiary">回数は授業の回数です。同じ日のコマはまとめて 1 回と数えます。</p>
        <p className="text-xs text-fg-tertiary">{CourseRuleLogic.footnote(rateOn, maxOn, userRate, rate)}</p>
      </section>
      {error ? <p className="rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{error.message}</p> : null}
    </BottomSheet>
  );
}
