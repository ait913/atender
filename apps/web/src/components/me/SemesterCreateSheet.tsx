import { useState } from "react";
import { useCreateSemester } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function SemesterCreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const create = useCreateSemester();
  return (
    <BottomSheet open={open} onClose={onClose} title="学期を追加">
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate({ name, startDate, endDate }, { onSuccess: onClose }); }}>
        <Field label="学期名"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="開始日"><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field>
        <Field label="終了日"><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></Field>
        <Button type="submit">保存</Button>
      </form>
    </BottomSheet>
  );
}
