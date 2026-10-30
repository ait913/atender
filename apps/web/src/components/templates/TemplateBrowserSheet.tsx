import { useEffect, useRef, useState } from "react";
import type { DepartmentDto, SchoolDto, TemplateDto, UserTimetableDto } from "@atender/shared";
import { useCopyTemplate, useMe, useSemesters, useTemplates, useUserTimetables } from "@/api/hooks";
import { SchoolDepartmentPicker } from "@/components/setup/SchoolDepartmentPicker";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, ConfirmDialog, EmptyState, Select, Skeleton } from "@/components/ui";
import * as TemplateSuggestionLogic from "@/lib/TemplateSuggestionLogic";
import { ApiError } from "@/api/client";
import * as TemplateImportLogic from "@/lib/TemplateImportLogic";
import { showToast } from "@/lib/toast";

export type TemplateScope = { schoolId: string; departmentId: string; schoolName: string; departmentName: string };
type Props = {
  open: boolean;
  purpose: { kind: "importInto"; initialSemesterId: string | null; lockSemester: boolean } | { kind: "select" };
  onImported?: (timetable: UserTimetableDto) => void;
  showsFoundBanner: boolean;
  initialScope: TemplateScope;
  onSelected?: (template: TemplateDto) => void;
  onBack: () => void;
  onClose: () => void;
};

export function TemplateBrowserSheet({ open, purpose, showsFoundBanner, initialScope, onImported, onSelected, onBack, onClose }: Props) {
  const me = useMe();
  const [scope, setScope] = useState(initialScope);
  const [screen, setScreen] = useState<"list" | "school" | "preview">("list");
  const [preview, setPreview] = useState<TemplateDto | null>(null);
  const [schoolValue, setSchoolValue] = useState<{ school: SchoolDto | null; department: DepartmentDto | null }>({ school: null, department: null });
  const templates = useTemplates({ schoolId: scope.schoolId, departmentId: scope.departmentId, limit: 20 }, { enabled: open, staleTime: 0 });
  const visible = TemplateSuggestionLogic.visible(templates.data?.templates ?? []);

  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const copy = useCopyTemplate();
  const [targetSemesterId, setTargetSemesterId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  // 取込の世代。シートが閉じる / 開き直されると進めて、待っていた取込を無効にする
  const importGen = useRef(0);
  const [confirmation, setConfirmation] = useState<{ template: TemplateDto; target: string; name: string; decision: TemplateImportLogic.TemplateImportDecision; retried: boolean } | null>(null);
  const latest = useRef({ purpose, initialScope, defaultSemesterId: me.data?.user.defaultSemesterId });
  latest.current = { purpose, initialScope, defaultSemesterId: me.data?.user.defaultSemesterId };

  useEffect(() => {
    importGen.current += 1;
    if (!open) return;
    setScope(latest.current.initialScope);
    setScreen("list");
    setPreview(null);
    setConfirmation(null);
    if (latest.current.purpose.kind !== "importInto") return;
    let active = true;
    setReady(false);
    setLoadError(false);
    const initial = latest.current.purpose.initialSemesterId ?? latest.current.defaultSemesterId;
    void Promise.all([semesters.refetch(), timetables.refetch()]).then(([s, t]) => {
      if (!active) return;
      setLoadError(s.isError || t.isError);
      setReady(!s.isError && !t.isError);
      setTargetSemesterId(s.data?.semesters.length ? initial ?? s.data.semesters[0]!.id : null);
    });
    return () => { active = false; };
  }, [open, semesters.refetch, timetables.refetch]);

  async function reloadTargets() {
    setReady(false);
    const [s, t] = await Promise.all([semesters.refetch(), timetables.refetch()]);
    setLoadError(s.isError || t.isError);
    setReady(!s.isError && !t.isError);
    setTargetSemesterId(s.data?.semesters.length ? targetSemesterId ?? (latest.current.purpose.kind === "importInto" ? latest.current.purpose.initialSemesterId : null) ?? latest.current.defaultSemesterId ?? s.data.semesters[0]!.id : null);
  }

  // 取込ボタンの押下時に時間割を取り直し、最新の「空 / 既存あり」で判定する (置換の誤判定を避ける)
  async function startImport(template: TemplateDto, target: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const gen = importGen.current;
    let fresh: UserTimetableDto[] | null = null;
    try {
      const refreshed = await timetables.refetch();
      if (!refreshed.isError && refreshed.data) fresh = refreshed.data.userTimetables;
    } finally {
      busy.current = false;
      setPending(false);
    }
    // 待っている間に閉じられた / 開き直された場合は何もしない
    if (gen !== importGen.current) return;
    if (!fresh) {
      showToast("取り込めませんでした、もう一度試してください");
      return;
    }
    decideImport(template, target, fresh);
  }

  function decideImport(template: TemplateDto, target: string, existing: UserTimetableDto[], retried = false) {
    const decision = TemplateImportLogic.decide(existing.find((t) => t.semesterId === target) ?? null);
    if (decision.kind === "confirmReplace") {
      setConfirmation({ template, target, name: semesters.data?.semesters.find((s) => s.id === target)?.name ?? "", decision, retried });
    } else {
      void executeImport(template, target, decision, retried);
    }
  }

  async function executeImport(template: TemplateDto, target: string, decision: TemplateImportLogic.TemplateImportDecision, retried: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    let retryTimetables: UserTimetableDto[] | null = null;
    try {
      const result = await copy.mutateAsync({ templateId: template.id, input: TemplateImportLogic.copyInput(target, decision) });
      showToast(`「${template.title}」を取り込みました`);
      onImported?.(result.userTimetable);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && !retried) {
        const refreshed = await timetables.refetch();
        if (refreshed.isError || !refreshed.data) {
          showToast("取り込めませんでした、もう一度試してください");
        } else {
          retryTimetables = refreshed.data.userTimetables;
        }
      } else if (error instanceof ApiError && error.status === 404) {
        showToast("この時間割は公開が終了しました");
        void templates.refetch();
        setScreen("list");
      } else {
        showToast("取り込めませんでした、もう一度試してください");
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
    if (retryTimetables) decideImport(template, target, retryTimetables, true);
  }

  const targetName = semesters.data?.semesters.find((s) => s.id === targetSemesterId)?.name ?? "";

  return (
    <>
      <BottomSheet open={open} onClose={onClose} onBack={() => screen === "list" ? onBack() : setScreen("list")} stackLevel={2} title={screen === "school" ? "学校・学科" : screen === "preview" ? "時間割の中身" : "公開時間割"}>
        {screen === "school" ? (
          <SchoolDepartmentPicker allowsCreate={false} value={schoolValue} onChange={(value) => {
            setSchoolValue(value);
            if (value.school && value.department) {
              setScope({ schoolId: value.school.id, departmentId: value.department.id, schoolName: value.school.name, departmentName: value.department.name });
              setScreen("list");
            }
          }} />
        ) : screen === "preview" && preview ? (
          <div data-testid="template-preview" className="space-y-4">
            <h2 className="text-2xl font-bold">{preview.title}</h2>
            <p className="text-sm text-fg-secondary">{TemplateSuggestionLogic.sizeText(preview)} / {TemplateSuggestionLogic.metaText(preview, me.data?.user.id ?? null)}</p>
            <div className="space-y-3 rounded-md bg-bg-elevated p-4 shadow-card">
              {TemplateSuggestionLogic.previewRows(preview).map((row) => (
                <div key={row.id} className="flex gap-3">
                  <span>{row.weekday}</span><span>{row.periodText}</span>
                  <div><p>{row.courseName}</p>{row.detail ? <p className="text-sm text-fg-secondary">{row.detail}</p> : null}</div>
                </div>
              ))}
            </div>
            {purpose.kind === "select" ? <Button type="button" variant="primary" onClick={() => onSelected?.(preview)}>この時間割を使う</Button> : <>
              <Button type="button" variant="primary" data-testid="template-import-button" disabled={!ready || !targetSemesterId || pending || confirmation !== null} onClick={() => { if (targetSemesterId) void startImport(preview, targetSemesterId); }}>この学期に取り込む</Button>
              {ready && !targetSemesterId ? <p>先に学期を作成してください</p> : null}
            </>}
          </div>
        ) : (
          <div className="space-y-4">
            {showsFoundBanner ? <div className="rounded-md bg-accent-500/15 p-4"><p className="font-bold">✓ 同じ学科の時間割が見つかりました</p><p className="text-sm text-fg-secondary">そのまま自分の学期に取り込めます</p></div> : null}
            {purpose.kind === "importInto" ? <div>
              {purpose.lockSemester ? <p>取り込み先: {targetName}</p> : <label>取り込み先 <Select data-testid="template-target-semester" value={targetSemesterId ?? ""} onChange={(event) => setTargetSemesterId(event.currentTarget.value || null)}>
                {!targetSemesterId ? <option value="">未設定</option> : null}
                {(semesters.data?.semesters ?? []).map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
              </Select></label>}
              {loadError ? <div><p>読み込めませんでした</p><Button type="button" variant="secondary" onClick={() => void reloadTargets()}>再読み込み</Button></div> : null}
            </div> : null}
            <div className="flex items-center justify-between gap-3">
              <span>{scope.schoolName} › {scope.departmentName}</span>
              <Button type="button" variant="secondary" data-testid="template-browse-other" onClick={() => { setSchoolValue({ school: null, department: null }); setScreen("school"); }}>別の学科を探す</Button>
            </div>
            {templates.isFetching ? [0, 1, 2].map((index) => <Skeleton key={index} height="100px" />) : templates.isError ? (
              <div><p>読み込めませんでした</p><Button type="button" variant="secondary" onClick={() => void templates.refetch()}>再読み込み</Button></div>
            ) : visible.length === 0 ? (
              <EmptyState title="この学科の公開時間割はまだありません">時間割を作って「みんなの時間割で公開」をオンにすると、同じ学科の人が使えるようになります</EmptyState>
            ) : visible.map((template) => (
              <button type="button" key={template.id} data-testid={`template-card-${template.id}`} className="block w-full rounded-md bg-bg-elevated p-4 text-left shadow-card" onClick={() => { setPreview(template); setScreen("preview"); }}>
                <p className="line-clamp-2 text-lg font-semibold">{template.title}</p>
                <p className="text-sm text-fg-secondary">{TemplateSuggestionLogic.sizeText(template)}</p>
                <p className="text-xs text-fg-tertiary">{TemplateSuggestionLogic.metaText(template, me.data?.user.id ?? null)}</p>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
      <ConfirmDialog open={open && confirmation !== null} stackLevel={3} title="既存の時間割と出欠記録を置き換えます" body={confirmation && confirmation.decision.kind === "confirmReplace" ? `「${confirmation.name}」の時間割（${confirmation.decision.courseCount} 科目）と、その出欠記録はすべて削除され、元に戻せません。` : undefined} confirmLabel="置き換える" onCancel={() => setConfirmation(null)} onConfirm={() => {
        if (!confirmation) return;
        const current = confirmation;
        setConfirmation(null);
        void executeImport(current.template, current.target, current.decision, current.retried);
      }} />
    </>
  );
}
