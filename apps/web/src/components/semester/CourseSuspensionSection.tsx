import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useCourseSuspensions, useCreateCourseSuspension, useDeleteCourseSuspension } from "@/api/hooks";
import { Button, Field, Input } from "@/components/ui";

type Props = { courseId: string };

export function CourseSuspensionSection({ courseId }: Props) {
  const list = useCourseSuspensions(courseId);
  const create = useCreateCourseSuspension(courseId);
  const remove = useDeleteCourseSuspension(courseId);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  function handleAdd() {
    if (!date) return;
    create.mutate({ date, reason: reason || undefined }, {
      onSuccess: () => {
        setDate("");
        setReason("");
      },
    });
  }

  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <h3 className="mb-3 text-base font-bold">休講日</h3>
      <ul className="space-y-2">
        {(list.data?.suspensions ?? []).map((suspension) => (
          <li key={suspension.id} className="flex items-center justify-between rounded-2xl bg-bg-muted/50 px-3 py-2">
            <span className="font-bold tabular-nums">{suspension.date}</span>
            <span className="min-w-0 flex-1 truncate px-2 text-xs text-fg-tertiary">{suspension.reason ?? ""}</span>
            <button
              type="button"
              onClick={() => remove.mutate(suspension.id)}
              className="grid h-8 w-8 place-items-center rounded-full text-status-absent hover:bg-status-absent/10"
              aria-label="休講日を削除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {(list.data?.suspensions ?? []).length === 0 ? (
          <li className="rounded-2xl bg-bg-muted/50 px-3 py-3 text-xs text-fg-tertiary">休講日はまだ登録されていません</li>
        ) : null}
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="日付" className="flex-1">
          <Input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} />
        </Field>
        <Field label="理由 (任意)" className="flex-[2]">
          <Input value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="学園祭振替 等" maxLength={100} />
        </Field>
        <Button type="button" variant="primary" disabled={!date || create.isPending} onClick={handleAdd}>追加</Button>
      </div>
      {create.error ? (
        <p className="mt-2 rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{create.error.message}</p>
      ) : null}
    </section>
  );
}
