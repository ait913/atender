import { useEffect, useState } from "react";
import type { CourseDto } from "@atender/shared";
import { useCreateCourse, useUpdateCourse } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Textarea } from "@/components/ui";

const colors = ["#10b981", "#60a5fa", "#f472b6", "#8b5cf6", "#f59e0b"];

type CourseEditModalProps = {
  open: boolean;
  onClose: () => void;
  timetableId: string;
  course?: CourseDto | null;
  stackLevel?: 1 | 2;
  onSaved?: (course: CourseDto) => void;
};

export function CourseEditModal({ open, onClose, timetableId, course, stackLevel = 1, onSaved }: CourseEditModalProps) {
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse(course?.id);
  const [form, setForm] = useState({
    name: "",
    teacher: "",
    totalSessions: "15",
    color: colors[0]!,
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: course?.name ?? "",
      teacher: course?.teacher ?? "",
      totalSessions: String(course?.totalSessions ?? 15),
      color: course?.color ?? colors[0]!,
      note: course?.note ?? "",
    });
  }, [course, open]);

  const isPending = createCourse.isPending || updateCourse.isPending;
  const canSave = form.name.trim().length > 0 && !isPending;

  async function handleSave() {
    if (!canSave) return;
    const totalSessions = Math.min(60, Math.max(1, Number(form.totalSessions) || 15));
    if (course) {
      const result = await updateCourse.mutateAsync({
        name: form.name.trim(),
        teacher: form.teacher.trim() ? form.teacher.trim() : null,
        color: form.color,
        totalSessions,
        note: form.note.trim() ? form.note.trim() : null,
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
      totalSessions,
      note: form.note.trim() || undefined,
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
      <Field label="総コマ数">
        <Input type="number" min={1} max={60} value={form.totalSessions} onChange={(event) => setForm({ ...form, totalSessions: event.currentTarget.value })} />
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
      {error ? <p className="rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{error.message}</p> : null}
    </BottomSheet>
  );
}
