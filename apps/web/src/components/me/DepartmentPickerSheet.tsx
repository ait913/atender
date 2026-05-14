import { useState } from "react";
import type { DepartmentDto } from "@atender/shared";
import { useCreateDepartment, useDepartments } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function DepartmentPickerSheet({ open, schoolId, onSelect, onClose }: { open: boolean; schoolId?: string | null; onSelect: (department: DepartmentDto) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const departments = useDepartments(schoolId, name);
  const create = useCreateDepartment(schoolId);
  return (
    <BottomSheet open={open} onClose={onClose} title="学科を選ぶ">
      <div className="grid gap-3">
        <Field label="学科名"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <div className="grid gap-1">
          {departments.data?.departments.map((department) => (
            <button key={department.id} type="button" className="min-h-11 rounded-md px-3 text-left hover:bg-bg-muted" onClick={() => { onSelect(department); onClose(); }}>
              {department.name}
            </button>
          ))}
        </div>
        <Button
          disabled={!schoolId || !name}
          onClick={() => create.mutate({ name }, { onSuccess: (result) => { const department = "department" in result ? result.department : result; onSelect(department); onClose(); } })}
        >
          新規作成
        </Button>
      </div>
    </BottomSheet>
  );
}
