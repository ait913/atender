import { useState } from "react";
import type { DepartmentDto } from "@atender/shared";
import { useCreateDepartment, useDepartments } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function DepartmentPickerSheet({ open, schoolId, onSelect, onClose }: { open: boolean; schoolId?: string | null; onSelect: (department: DepartmentDto) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const departments = useDepartments(schoolId, name);
  const create = useCreateDepartment(schoolId);
  return (
    <BottomSheet open={open} onClose={onClose} title="学科を選ぶ" closeDisabled={create.isPending}>
      <div className="grid gap-3">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        <Field label="学科名"><Input value={name} onChange={(event) => setName(event.target.value)} disabled={create.isPending} /></Field>
        <div className="grid gap-1">
          {departments.data?.departments.map((department) => (
            <button key={department.id} type="button" className="min-h-11 rounded-md px-3 text-left hover:bg-bg-muted disabled:opacity-50" disabled={create.isPending} onClick={() => { onSelect(department); onClose(); }}>
              {department.name}
            </button>
          ))}
        </div>
        <Button
          disabled={!schoolId || !name || create.isPending}
          onClick={() => {
            setError(null);
            create.mutate({ name }, { onSuccess: (result) => { const department = "department" in result ? result.department : result; onSelect(department); onClose(); }, onError: () => setError("作成できませんでした") });
          }}
        >
          {create.isPending ? "作成中..." : "新規作成"}
        </Button>
      </div>
    </BottomSheet>
  );
}
