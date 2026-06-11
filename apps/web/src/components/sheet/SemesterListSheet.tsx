import { useState } from "react";
import { useCreateSemester, useDeleteSemester, useMe, usePatchMe, useSemesters, useUpdateSemester } from "@/api/hooks";
import type { SemesterDto, SemesterUpdateInput } from "@/api/hooks/types";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function SemesterListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const semesters = useSemesters();
  const create = useCreateSemester();
  const remove = useDeleteSemester();
  const patchMe = usePatchMe();
  const update = useUpdateSemester();
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", startDate: "", endDate: "" });

  function startEditing(semester: SemesterDto) {
    setEditingId(semester.id);
    setEditForm({ name: semester.name, startDate: semester.startDate, endDate: semester.endDate });
  }

  function saveEdit(semester: SemesterDto) {
    const body: SemesterUpdateInput = {};
    if (editForm.name !== semester.name && editForm.name.trim()) body.name = editForm.name;
    if (editForm.startDate !== semester.startDate) body.startDate = editForm.startDate;
    if (editForm.endDate !== semester.endDate) body.endDate = editForm.endDate;
    update.mutate({ id: semester.id, body }, { onSuccess: () => setEditingId(null) });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="学期管理">
      <div className="space-y-2">
        {(semesters.data?.semesters ?? []).map((semester) => {
          const isEditing = editingId === semester.id;
          const saveDisabled = update.isPending || !editForm.name.trim() || editForm.startDate > editForm.endDate;
          return (
            <div key={semester.id} className="rounded-md border border-border-subtle p-3">
              {isEditing ? (
                <div className="space-y-3">
                  <Field label="学期名"><Input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.currentTarget.value })} /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="開始日"><Input type="date" value={editForm.startDate} onChange={(event) => setEditForm({ ...editForm, startDate: event.currentTarget.value })} /></Field>
                    <Field label="終了日"><Input type="date" value={editForm.endDate} onChange={(event) => setEditForm({ ...editForm, endDate: event.currentTarget.value })} /></Field>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="primary" size="sm" disabled={saveDisabled} onClick={() => saveEdit(semester)}>保存</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>キャンセル</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <button type="button" className="min-w-0 text-left" onClick={() => patchMe.mutate({ defaultSemesterId: semester.id })}>
                    <p className="font-semibold">{semester.name}</p>
                    <p className="text-xs text-fg-secondary">{semester.startDate} - {semester.endDate}{me.data?.user.defaultSemesterId === semester.id ? " / 現在" : ""}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => startEditing(semester)}>編集</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove.mutate(semester.id)}>削除</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="space-y-4 border-t border-border-subtle pt-5">
        <Field label="学期名"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="開始日"><Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.currentTarget.value })} /></Field>
          <Field label="終了日"><Input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.currentTarget.value })} /></Field>
        </div>
        <Button type="button" variant="primary" disabled={!form.name || !form.startDate || !form.endDate} onClick={() => create.mutate(form, { onSuccess: () => setForm({ name: "", startDate: "", endDate: "" }) })}>学期を追加</Button>
      </div>
    </BottomSheet>
  );
}
