import { useState } from "react";
import { usePublishTemplate } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function TemplatePublishSheet({ open, onClose, userTimetableId }: { open: boolean; onClose: () => void; userTimetableId?: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [term, setTerm] = useState("");
  const publish = usePublishTemplate(userTimetableId);
  return (
    <BottomSheet open={open} onClose={onClose} title="時間割を公開">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          publish.mutate({ title, description: description || undefined, year: year === "" ? undefined : year, term: term || undefined }, { onSuccess: onClose });
        }}
      >
        <Field label="タイトル"><Input value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
        <Field label="説明"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></Field>
        <Field label="年度"><Input type="number" min={1} max={8} value={year} onChange={(event) => setYear(event.target.value === "" ? "" : Number(event.target.value))} /></Field>
        <Field label="学期"><Input value={term} onChange={(event) => setTerm(event.target.value)} /></Field>
        <Button type="submit" disabled={!userTimetableId}>公開</Button>
      </form>
    </BottomSheet>
  );
}
