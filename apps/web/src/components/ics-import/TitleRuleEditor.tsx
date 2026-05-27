import { useState } from "react";
import type { IcsTitleRuleDto } from "@atender/shared";
import { useCreateIcsTitleRule, useDeleteIcsTitleRule, useIcsTitleRules, usePatchIcsTitleRule, type TitleRuleInput } from "@/api/hooks";
import { Button, Field, Input } from "@/components/ui";
import { Select } from "@/components/ui/Input";

const emptyRule: TitleRuleInput = {
  matchType: "CONTAINS",
  pattern: "",
  replaceWith: "予定",
  visibilityMode: "TITLE_MAPPED",
  priority: 100,
};

export function TitleRuleEditor() {
  const rules = useIcsTitleRules();
  const create = useCreateIcsTitleRule();
  const patch = usePatchIcsTitleRule();
  const remove = useDeleteIcsTitleRule();
  const [editing, setEditing] = useState<IcsTitleRuleDto | "new" | null>(null);
  const [form, setForm] = useState<TitleRuleInput>(emptyRule);

  function open(rule: IcsTitleRuleDto | "new") {
    setEditing(rule);
    setForm(rule === "new" ? emptyRule : {
      matchType: rule.matchType,
      pattern: rule.pattern,
      replaceWith: rule.replaceWith,
      visibilityMode: rule.visibilityMode,
      priority: rule.priority,
    });
  }

  function save() {
    if (!form.pattern.trim()) return;
    if (editing === "new") {
      create.mutate(form, { onSuccess: () => setEditing(null) });
      return;
    }
    if (editing) patch.mutate({ id: editing.id, body: form }, { onSuccess: () => setEditing(null) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">カレンダー設定</h1>
          <p className="text-sm font-semibold text-fg-secondary">import した予定のタイトルを置き換えます。</p>
        </div>
        <Button type="button" variant="primary" onClick={() => open("new")}>新規ルール</Button>
      </div>

      <div className="space-y-2">
        {(rules.data?.rules ?? []).map((rule) => (
          <div key={rule.id} className="rounded-2xl bg-bg-elevated p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-fg-primary">
                  {rule.pattern} → {rule.replaceWith ?? "予定"}
                </p>
                <p className="mt-1 text-xs font-semibold text-fg-tertiary">{rule.matchType} / {rule.visibilityMode} / 優先度 {rule.priority}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={rule.isDefault} onClick={() => open(rule)}>編集</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove.mutate(rule.id)}>削除</Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <div className="rounded-2xl bg-bg-elevated p-4 shadow-card">
          <h2 className="mb-3 text-lg font-black">{editing === "new" ? "ルールを追加" : "ルールを編集"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="種別">
              <Select value={form.matchType} onChange={(event) => setForm((value) => ({ ...value, matchType: event.currentTarget.value as TitleRuleInput["matchType"] }))}>
                <option value="EQUALS">完全一致</option>
                <option value="CONTAINS">部分一致</option>
                <option value="REGEX">正規表現</option>
              </Select>
            </Field>
            <Field label="パターン" required><Input value={form.pattern} onChange={(event) => setForm((value) => ({ ...value, pattern: event.currentTarget.value }))} /></Field>
            <Field label="置換後"><Input value={form.replaceWith ?? ""} onChange={(event) => setForm((value) => ({ ...value, replaceWith: event.currentTarget.value || null }))} /></Field>
            <Field label="表示モード">
              <Select value={form.visibilityMode} onChange={(event) => setForm((value) => ({ ...value, visibilityMode: event.currentTarget.value as TitleRuleInput["visibilityMode"] }))}>
                <option value="NORMAL">通常</option>
                <option value="TITLE_MAPPED">タイトル隠す</option>
                <option value="BUSY_ONLY">予定ありのみ</option>
              </Select>
            </Field>
            <Field label="優先度"><Input type="number" min={0} max={9998} value={form.priority ?? 100} onChange={(event) => setForm((value) => ({ ...value, priority: Number(event.currentTarget.value) }))} /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>キャンセル</Button>
            <Button type="button" variant="primary" disabled={!form.pattern.trim()} onClick={save}>保存</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
