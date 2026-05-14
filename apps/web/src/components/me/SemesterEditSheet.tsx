import { useEffect, useState } from "react";
import type { SemesterDto } from "@atender/shared";
import { useUpdateSemester } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function SemesterEditSheet({ open, semester, onClose }: { open: boolean; semester: SemesterDto | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const update = useUpdateSemester(semester?.id);
  useEffect(() => {
    if (semester) {
      setName(semester.name);
      setStartDate(semester.startDate);
      setEndDate(semester.endDate);
    }
  }, [semester]);
  return (
    <BottomSheet open={open} onClose={onClose} title="学期を編集">
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); update.mutate({ name, startDate, endDate }, { onSuccess: onClose }); }}>
        <Field label="学期名"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="開始日"><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field>
        <Field label="終了日"><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></Field>
        <Button type="submit">保存</Button>
      </form>
    </BottomSheet>
  );
}
