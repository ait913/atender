import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { DepartmentDto, SchoolDto, TemplateDto } from "@atender/shared";
import { ApiError } from "@/api/client";
import { meQueryOptions, useCopyTemplate, useCreateSemester, usePatchMe, useTemplates } from "@/api/hooks";
import { SchoolDepartmentPicker } from "@/components/setup/SchoolDepartmentPicker";
import { Button, Field, Input, PageTitle, Panel } from "@/components/ui";
import * as SchoolClock from "@/lib/SchoolClock";
import * as SemesterCreationPlan from "@/lib/SemesterCreationPlan";
import * as SemesterRollover from "@/lib/SemesterRollover";
import * as TemplateImportLogic from "@/lib/TemplateImportLogic";
import * as TemplateSuggestionLogic from "@/lib/TemplateSuggestionLogic";

export function Setup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"school" | "department" | "template" | "semester">("school");
  const [selection, setSelection] = useState<{ school: SchoolDto | null; department: DepartmentDto | null }>({ school: null, department: null });
  const { school, department } = selection;
  const [suggestions, setSuggestions] = useState<TemplateDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [semester, setSemester] = useState(() => SemesterRollover.initialProposal(SchoolClock.todayString()));
  const [createdSemesterId, setCreatedSemesterId] = useState<string | null>(null);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const createSemester = useCreateSemester();
  const copyTemplate = useCopyTemplate();
  const patchMe = usePatchMe();
  const templates = useTemplates({ schoolId: school?.id, departmentId: department?.id, limit: 20 }, { enabled: false });
  const total = suggestions.length > 0 ? 4 : 3;
  const title = step === "school" ? `Step 1/${total}: 学校を選ぶ` : step === "department" ? `Step 2/${total}: 学科を選ぶ` : step === "template" ? `Step 3/${total}: 時間割を選ぶ` : `Step ${total}/${total}: 学期を作る`;
  const selectedTemplate = suggestions.find((template) => template.id === selectedTemplateId);

  function changeSelection(next: typeof selection) {
    setSelection(next);
    setStep(next.school == null ? "school" : "department");
    setError(null);
  }

  async function submitDepartment() {
    if (!school || !department || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await patchMe.mutateAsync({ schoolId: school.id, departmentId: department.id });
      const result = await templates.refetch();
      const next = result.isError ? [] : TemplateSuggestionLogic.visible(result.data?.templates ?? []);
      setSuggestions(next);
      setSelectedTemplateId(null);
      setExpanded([]);
      setStep(next.length > 0 ? "template" : "semester");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function submitSemester(templateId = selectedTemplateId) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setCopyFailed(false);
    let semesterId = createdSemesterId;
    try {
      for (const action of SemesterCreationPlan.steps("onboarding", semesterId, templateId, templateCopied)) {
        switch (action.kind) {
          case "createSemester": {
            const result = await createSemester.mutateAsync(semester);
            semesterId = result.semester.id;
            setCreatedSemesterId(semesterId);
            break;
          }
          case "copyTemplate":
            try {
              await copyTemplate.mutateAsync({ templateId: action.templateId, input: TemplateImportLogic.copyInput(semesterId!, { kind: "copy" }) });
            } catch (cause) {
              if (!(cause instanceof ApiError && cause.status === 409)) {
                setCopyFailed(true);
                throw cause;
              }
            }
            setTemplateCopied(true);
            break;
          case "setDefaultSemester":
            await patchMe.mutateAsync({ defaultSemesterId: semesterId! });
            break;
          case "refreshMe":
            await queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 });
            await navigate({ to: "/" });
            break;
        }
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageTitle title="セットアップ">{title}</PageTitle>
      <Panel>
        {error ? <p role="alert" className="mb-4 rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">{error}</p> : null}
        {step === "school" || step === "department" ? (
          <div className="space-y-4">
            <SchoolDepartmentPicker allowsCreate value={selection} onChange={changeSelection} disabled={busy} />
            {step === "department" ? (
              <div className="flex justify-between gap-3">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => changeSelection({ school: null, department: null })}>戻る</Button>
                <Button type="button" variant="primary" disabled={!department || busy} onClick={submitDepartment}>次へ</Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {step === "template" ? (
          <div data-testid="setup-template-step" className="space-y-4">
            <p className="font-bold">✓ 同じ学科の時間割が見つかりました</p>
            <p>{school?.name} {department?.name} で公開されている時間割を、そのまま自分の学期に取り込めます。</p>
            {suggestions.map((template) => (
              <div key={template.id} data-testid={`setup-template-card-${template.id}`} className={`space-y-2 rounded-md border p-3 ${selectedTemplateId === template.id ? "border-accent-500 bg-accent-50" : "border-border-subtle"}`}>
                <button type="button" className="block w-full text-left font-bold" aria-pressed={selectedTemplateId === template.id} onClick={() => setSelectedTemplateId(template.id)}>{selectedTemplateId === template.id ? "◉" : "○"} {template.title}</button>
                <p className="text-sm">{TemplateSuggestionLogic.sizeText(template)}</p>
                <p className="text-sm text-fg-secondary">{TemplateSuggestionLogic.metaText(template, null)}</p>
                <Button type="button" variant="ghost" size="sm" aria-expanded={expanded.includes(template.id)} onClick={() => setExpanded((current) => current.includes(template.id) ? current.filter((id) => id !== template.id) : [...current, template.id])}>中身を見る ⌄</Button>
                {expanded.includes(template.id) ? (
                  <div className="space-y-2">
                    {TemplateSuggestionLogic.previewRows(template).map((row) => <div key={row.id}><p>{row.weekday} {row.periodText} {row.courseName}</p>{row.detail ? <p className="text-sm text-fg-secondary">{row.detail}</p> : null}</div>)}
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="primary" data-testid="setup-template-use" disabled={selectedTemplateId == null} onClick={() => setStep("semester")}>この時間割で進む</Button>
              <Button type="button" variant="secondary" data-testid="setup-template-skip" onClick={() => { setSelectedTemplateId(null); setStep("semester"); }}>使わずに進む</Button>
              <Button type="button" variant="ghost" onClick={() => { setSuggestions([]); setSelectedTemplateId(null); setStep("department"); }}>戻る</Button>
            </div>
          </div>
        ) : null}
        {step === "semester" ? (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submitSemester(); }}>
            {selectedTemplate ? <div className="flex items-center justify-between gap-3"><span>取り込む時間割: {selectedTemplate.title}</span><Button type="button" variant="ghost" size="sm" disabled={createdSemesterId != null || busy} onClick={() => setStep("template")}>変更</Button></div> : null}
            <Field label="名前"><Input value={semester.name} disabled={createdSemesterId != null || busy} onChange={(event) => setSemester({ ...semester, name: event.currentTarget.value })} /></Field>
            <Field label="開始日"><Input type="date" value={semester.startDate} disabled={createdSemesterId != null || busy} onChange={(event) => setSemester({ ...semester, startDate: event.currentTarget.value })} /></Field>
            <Field label="終了日"><Input type="date" value={semester.endDate} disabled={createdSemesterId != null || busy} onChange={(event) => setSemester({ ...semester, endDate: event.currentTarget.value })} /></Field>
            {copyFailed ? (
              <div className="space-y-3">
                <p role="alert" className="rounded-2xl bg-status-absent/15 px-4 py-3 text-sm font-bold text-status-absent">学期は作成しました。時間割を取り込めませんでした</p>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="primary" disabled={busy} onClick={() => { setCopyFailed(false); void submitSemester(); }}>もう一度</Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => { setSelectedTemplateId(null); void submitSemester(null); }}>取り込まずに完了</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between gap-3">
                <Button type="button" variant="ghost" disabled={createdSemesterId != null || busy} onClick={() => { setError(null); setStep(suggestions.length > 0 ? "template" : "department"); }}>戻る</Button>
                <Button type="submit" variant="primary" disabled={busy}>完了して時間割を作る</Button>
              </div>
            )}
          </form>
        ) : null}
      </Panel>
    </div>
  );
}
