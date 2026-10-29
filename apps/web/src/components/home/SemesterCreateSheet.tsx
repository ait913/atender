import { useEffect, useRef, useState } from "react";
import type { SemesterDto, TemplateDto } from "@atender/shared";
import { api, ApiError } from "@/api/client";
import { useCopyTemplate, useCreateSemester, useMe, usePatchMe } from "@/api/hooks";
import type { TemplatesResponse } from "@/api/hooks/types";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { TemplateBrowserSheet, type TemplateScope } from "@/components/templates/TemplateBrowserSheet";
import { Button, Field, Input } from "@/components/ui";
import * as SemesterCreationPlan from "@/lib/SemesterCreationPlan";
import * as SemesterRollover from "@/lib/SemesterRollover";
import * as TemplateSuggestionLogic from "@/lib/TemplateSuggestionLogic";
import { showToast } from "@/lib/toast";

type Props = {
  open: boolean;
  proposal: SemesterRollover.SemesterProposal;
  onCreated: (semester: SemesterDto) => void;
  onClose: () => void;
};

export function SemesterCreateSheet({ open, proposal, onCreated, onClose }: Props) {
  const me = useMe();
  const create = useCreateSemester();
  const copy = useCopyTemplate();
  const patchMe = usePatchMe();
  const [form, setForm] = useState(proposal);
  const [suggestions, setSuggestions] = useState<TemplateDto[]>([]);
  const [scope, setScope] = useState<TemplateScope | null>(null);
  const [selected, setSelected] = useState<TemplateDto | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const user = useRef(me.data?.user);
  user.current = me.data?.user;

  useEffect(() => {
    if (!open) return;
    setForm(proposal);
    setSelected(null);
    setSuggestions([]);
    setBrowserOpen(false);
    const current = user.current;
    if (!current?.schoolId || !current.departmentId) { setScope(null); return; }
    const initialScope = { schoolId: current.schoolId, departmentId: current.departmentId, schoolName: current.schoolName ?? "", departmentName: current.departmentName ?? "" };
    setScope(initialScope);
    let active = true;
    void api<TemplatesResponse>("/api/timetable-templates", { query: { schoolId: initialScope.schoolId, departmentId: initialScope.departmentId, limit: 20 } }).then((result) => {
      if (active) setSuggestions(TemplateSuggestionLogic.visible(result.templates));
    }).catch(() => { if (active) setSuggestions([]); });
    return () => { active = false; };
  }, [open, proposal]);

  function close() {
    if (!submitting.current) { setBrowserOpen(false); onClose(); }
  }

  async function submit() {
    if (submitting.current || !SemesterRollover.canCreate(form.name, form.startDate, form.endDate)) return;
    submitting.current = true;
    setPending(true);
    let created: SemesterDto | null = null;
    try {
      for (const step of SemesterCreationPlan.steps("rollover", null, selected?.id ?? null, false)) {
        if (step.kind === "createSemester") {
          try {
            created = (await create.mutateAsync({ ...form, name: form.name.trim() })).semester;
          } catch {
            showToast("保存できませんでした");
            return;
          }
        } else if (step.kind === "copyTemplate" && created) {
          try {
            await copy.mutateAsync({ templateId: step.templateId, input: { semesterId: created.id } });
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 409)) showToast("学期は作成しました。時間割は「時間割の設定」から取り込めます");
          }
        } else if (step.kind === "setDefaultSemester" && created) {
          try {
            await patchMe.mutateAsync({ defaultSemesterId: created.id });
          } catch {
            showToast("既定の学期を更新できませんでした。設定の学期管理から選べます");
          }
        }
      }
      if (created) { onCreated(created); onClose(); }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <BottomSheet open={open} onClose={close} title="新しい学期" footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" disabled={pending} onClick={close}>キャンセル</Button>
          <Button type="button" variant="primary" disabled={!SemesterRollover.canCreate(form.name, form.startDate, form.endDate) || pending} onClick={() => void submit()}>学期を作成</Button>
        </div>
      }>
        <div data-testid="semester-create-sheet" className="space-y-4">
          <Field label="学期名"><Input value={form.name} disabled={pending} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} /></Field>
          <Field label="開始日"><Input type="date" value={form.startDate} disabled={pending} onChange={(event) => setForm({ ...form, startDate: event.currentTarget.value })} /></Field>
          <Field label="終了日"><Input type="date" value={form.endDate} disabled={pending} onChange={(event) => setForm({ ...form, endDate: event.currentTarget.value })} /></Field>
          <p className="text-sm text-fg-secondary">{selected ? "時限と表示曜日は取り込む時間割に合わせます" : "時限と表示曜日は前の学期から引き継がれます"}</p>
          {suggestions.length > 0 ? (
            <div data-testid="semester-create-template-suggestion" className="flex items-center justify-between gap-3 rounded-md bg-bg-elevated p-4 shadow-card">
              <span>{selected ? `取り込む: ${selected.title}` : `同じ学科の時間割が ${suggestions.length} 件見つかりました`}</span>
              {selected ? <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setSelected(null)}>解除</Button> : <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setBrowserOpen(true)}>選ぶ</Button>}
            </div>
          ) : null}
        </div>
      </BottomSheet>
      {open && browserOpen && scope ? <TemplateBrowserSheet open purpose={{ kind: "select" }} showsFoundBanner initialScope={scope} onSelected={(template) => { setSelected(template); setBrowserOpen(false); }} onBack={() => setBrowserOpen(false)} onClose={close} /> : null}
    </>
  );
}
