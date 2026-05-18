import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { SCHOOL_KIND, type SchoolDto, type SchoolKind } from "@atender/shared";
import { useCreateSchool, useSchools } from "@/api/hooks";
import { Button, Field, IconButton, Input, Select } from "@/components/ui";

const SCHOOL_KIND_LABELS: Record<SchoolKind, string> = {
  UNIVERSITY: "大学",
  JUNIOR_COLLEGE: "短期大学",
  TECHNICAL_COLLEGE: "高等専門学校",
  VOCATIONAL_SCHOOL: "専門学校",
  HIGH_SCHOOL: "高等学校",
  OTHER: "その他",
};

export function SchoolSearch({ value, onChange }: { value: SchoolDto | null; onChange: (school: SchoolDto | null) => void }) {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<SchoolKind>("VOCATIONAL_SCHOOL");
  const [newPrefecture, setNewPrefecture] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createSchool = useCreateSchool();

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(input), 300);
    return () => window.clearTimeout(id);
  }, [input]);
  const schools = useSchools({ q: debounced || undefined, limit: 10 });
  const results = schools.data?.schools ?? [];

  function startCreate() {
    setNewName(input);
    setCreating(true);
    setError(null);
  }

  async function submitCreate() {
    if (!newName.trim()) return;
    setError(null);
    try {
      const res = await createSchool.mutateAsync({
        name: newName.trim(),
        kind: newKind,
        ...(newPrefecture.trim() ? { prefecture: newPrefecture.trim() } : {}),
      });
      onChange(res.school);
      setCreating(false);
      setInput("");
      setNewName("");
      setNewPrefecture("");
    } catch {
      setError("追加できませんでした (同名の学校が既にある可能性)");
    }
  }

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between rounded-md border border-border-subtle bg-accent-50 px-3">
        <span className="truncate text-sm font-semibold text-accent-700">{value.name}</span>
        <IconButton label="学校を解除" icon={<X className="h-4 w-4" />} onClick={() => onChange(null)} />
      </div>
    );
  }

  if (creating) {
    return (
      <div className="grid gap-3 rounded-md border border-border-subtle bg-bg-elevated p-3">
        <p className="text-sm font-semibold">学校を新しく追加</p>
        <Field label="学校名">
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例: 東京デザインテクノロジーセンター専門学校" required />
        </Field>
        <Field label="学校種別">
          <Select value={newKind} onChange={(event) => setNewKind(event.target.value as SchoolKind)}>
            {SCHOOL_KIND.map((kind) => (
              <option key={kind} value={kind}>{SCHOOL_KIND_LABELS[kind]}</option>
            ))}
          </Select>
        </Field>
        <Field label="都道府県 (任意)">
          <Input value={newPrefecture} onChange={(event) => setNewPrefecture(event.target.value)} placeholder="例: 東京都" />
        </Field>
        {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" onClick={() => { void submitCreate(); }} disabled={createSchool.isPending || !newName.trim()}>
            {createSchool.isPending ? "追加中" : "追加して選択"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setCreating(false); setError(null); }}>キャンセル</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input placeholder="学校名で検索" value={input} onChange={(event) => setInput(event.target.value)} />
      {input.trim() ? (
        <ul className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-md border border-border-subtle bg-bg-elevated shadow-card">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-fg-tertiary">該当する学校が見つかりません</li>
          ) : (
            results.slice(0, 10).map((school) => (
              <li key={school.id}>
                <button type="button" className="min-h-11 w-full px-3 text-left text-sm hover:bg-bg-muted" onClick={() => onChange(school)}>
                  {school.name}<span className="ml-2 text-fg-tertiary">{school.prefecture}</span>
                </button>
              </li>
            ))
          )}
          <li className="border-t border-border-subtle">
            <button type="button" className="min-h-11 w-full px-3 text-left text-sm font-semibold text-accent-700 hover:bg-bg-muted" onClick={startCreate}>
              + 「{input}」を新しく追加
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
