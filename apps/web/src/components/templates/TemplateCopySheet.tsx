import { useState } from "react";
import type { TemplateDto, SemesterDto } from "@atender/shared";
import { useCopyTemplate } from "@/api/hooks";
import { ApiError } from "@/api/client";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Select } from "@/components/ui";

export function TemplateCopySheet({ open, onClose, template, semesters }: { open: boolean; onClose: () => void; template: TemplateDto | null; semesters: SemesterDto[] }) {
  const [semesterId, setSemesterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const copy = useCopyTemplate();
  return (
    <BottomSheet open={open} onClose={onClose} title="この時間割を使う">
      <div className="grid gap-3">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        <Field label="コピー先の学期">
          <Select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">選択してください</option>
            {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
          </Select>
        </Field>
        <Button
          disabled={!template || !semesterId}
          onClick={() => {
            if (!template) return;
            copy.mutate(
              { templateId: template.id, input: { semesterId } },
              {
                onSuccess: onClose,
                onError: (err) => setError(err instanceof ApiError && err.status === 409 ? "この学期には既に時間割があります。別の学期を選ぶか、既存を削除してください" : "コピーできませんでした"),
              },
            );
          }}
        >
          コピー
        </Button>
      </div>
    </BottomSheet>
  );
}
