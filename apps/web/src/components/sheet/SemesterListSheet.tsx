import { useState } from "react";
import { useCreateSemester, useDeleteSemester, useMe, usePatchMe, useSemesters } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function SemesterListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const semesters = useSemesters();
  const create = useCreateSemester();
  const remove = useDeleteSemester();
  const patchMe = usePatchMe();
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  return (
    <BottomSheet open={open} onClose={onClose} title="学期管理">
      <div className="space-y-2">
        {(semesters.data?.semesters ?? []).map((semester) => (
          <div key={semester.id} className="flex items-center justify-between gap-3 rounded-md border border-border-subtle p-3">
            <button type="button" className="min-w-0 text-left" onClick={() => patchMe.mutate({ defaultSemesterId: semester.id })}>
              <p className="font-semibold">{semester.name}</p>
              <p className="text-xs text-fg-secondary">{semester.startDate} - {semester.endDate}{me.data?.user.defaultSemesterId === semester.id ? " / 現在" : ""}</p>
            </button>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove.mutate(semester.id)}>削除</Button>
          </div>
        ))}
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
