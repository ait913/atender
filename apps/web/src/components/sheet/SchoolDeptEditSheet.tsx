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
    <BottomSheet
      open={open}
      onClose={onClose}
      title="学校・学科"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button type="button" variant="primary" disabled={!schoolId || !departmentId || patch.isPending} onClick={() => patch.mutate({ schoolId, departmentId }, { onSuccess: onClose })}>保存</Button>
        </div>
      }
    >
      <Field label="学校 ID"><Input value={schoolId} onChange={(event) => setSchoolId(event.currentTarget.value)} /></Field>
      <Field label="学科 ID"><Input value={departmentId} onChange={(event) => setDepartmentId(event.currentTarget.value)} /></Field>
    </BottomSheet>
  );
}
