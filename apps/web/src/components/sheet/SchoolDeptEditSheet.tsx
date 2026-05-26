import { useEffect, useState } from "react";
import { useMe, usePatchMe } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Input } from "@/components/ui";

export function SchoolDeptEditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const patch = usePatchMe();
  const [schoolId, setSchoolId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  useEffect(() => {
    setSchoolId(me.data?.user.schoolId ?? "");
    setDepartmentId(me.data?.user.departmentId ?? "");
  }, [me.data?.user.departmentId, me.data?.user.schoolId, open]);
  return (
    <BottomSheet open={open} onClose={onClose} title="学校・学科">
      <Field label="学校 ID"><Input value={schoolId} onChange={(event) => setSchoolId(event.currentTarget.value)} /></Field>
      <Field label="学科 ID"><Input value={departmentId} onChange={(event) => setDepartmentId(event.currentTarget.value)} /></Field>
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button type="button" variant="primary" disabled={!schoolId || !departmentId || patch.isPending} onClick={() => patch.mutate({ schoolId, departmentId }, { onSuccess: onClose })}>保存</Button>
      </div>
    </BottomSheet>
  );
}
