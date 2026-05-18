import { useState } from "react";
import { useCreateSemester } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function SemesterCreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSemester();
  return (
    <BottomSheet open={open} onClose={onClose} title="学期を追加" closeDisabled={create.isPending}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); setError(null); create.mutate({ name, startDate, endDate }, { onSuccess: onClose, onError: () => setError("保存できませんでした") }); }}>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        <Field label="学期名"><Input value={name} onChange={(event) => setName(event.target.value)} required disabled={create.isPending} /></Field>
        <Field label="開始日"><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required disabled={create.isPending} /></Field>
        <Field label="終了日"><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required disabled={create.isPending} /></Field>
        <Button type="submit" disabled={create.isPending}>{create.isPending ? "保存中..." : "保存"}</Button>
      </form>
    </BottomSheet>
  );
}
