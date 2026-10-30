import { useEffect, useRef, useState } from "react";
import type { DepartmentDto, SchoolDto } from "@atender/shared";
import { api } from "@/api/client";
import { useMe, usePatchMe } from "@/api/hooks";
import type { TemplatesResponse } from "@/api/hooks/types";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { SchoolDepartmentPicker } from "@/components/setup/SchoolDepartmentPicker";
import { TemplateBrowserSheet, type TemplateScope } from "@/components/templates/TemplateBrowserSheet";
import { Button } from "@/components/ui";
import * as TemplateSuggestionLogic from "@/lib/TemplateSuggestionLogic";
import { showToast } from "@/lib/toast";

export function SchoolDeptEditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const patch = usePatchMe();
  const [value, setValue] = useState<{ school: SchoolDto | null; department: DepartmentDto | null }>({ school: null, department: null });
  const [scope, setScope] = useState<TemplateScope | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (!open) return;
    setValue({ school: null, department: null });
    setScope(null);
  }, [open]);

  function close() {
    if (submitting.current) return;
    setScope(null);
    onClose();
  }

  async function save() {
    if (!value.school || !value.department || submitting.current) return;
    const savedScope = { schoolId: value.school.id, departmentId: value.department.id, schoolName: value.school.name, departmentName: value.department.name };
    submitting.current = true;
    setPending(true);
    try {
      try {
        await patch.mutateAsync({ schoolId: savedScope.schoolId, departmentId: savedScope.departmentId });
      } catch {
        showToast("保存できませんでした");
        return;
      }
      try {
        const result = await api<TemplatesResponse>("/api/timetable-templates", { query: { schoolId: savedScope.schoolId, departmentId: savedScope.departmentId, limit: 20 } });
        if (TemplateSuggestionLogic.visible(result.templates).length > 0) {
          setScope(savedScope);
          return;
        }
      } catch {
        // 提案の取得失敗は変更成功として扱う。
      }
      showToast("学校・学科を変更しました");
      onClose();
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const user = me.data?.user;
  const unchanged = value.school?.id === user?.schoolId && value.department?.id === user?.departmentId;
  return (
    <>
      <BottomSheet open={open} onClose={close} title="学校・学科" footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" disabled={pending} onClick={close}>キャンセル</Button>
          <Button type="button" variant={value.school ? "primary" : "secondary"} disabled={!value.department || unchanged || pending} onClick={() => void save()}>保存</Button>
        </div>
      }>
        <p className="text-sm text-fg-secondary">現在: {user?.schoolName && user.departmentName ? `${user.schoolName} / ${user.departmentName}` : "未設定"}</p>
        {open ? <SchoolDepartmentPicker allowsCreate value={value} onChange={setValue} disabled={pending} /> : null}
      </BottomSheet>
      {open && scope ? <TemplateBrowserSheet open purpose={{ kind: "importInto", initialSemesterId: user?.defaultSemesterId ?? null, lockSemester: false }} showsFoundBanner initialScope={scope} onImported={close} onBack={() => setScope(null)} onClose={close} /> : null}
    </>
  );
}
