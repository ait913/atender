import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SchoolDto } from "@atender/shared";
import { useSchools } from "@/api/hooks";
import { IconButton, Input } from "@/components/ui";

export function SchoolSearch({ value, onChange }: { value: SchoolDto | null; onChange: (school: SchoolDto | null) => void }) {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(input), 300);
    return () => window.clearTimeout(id);
  }, [input]);
  const schools = useSchools({ q: debounced || undefined, limit: 10 });

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between rounded-md border border-border-subtle bg-accent-50 px-3">
        <span className="truncate text-sm font-semibold text-accent-700">{value.name}</span>
        <IconButton label="学校を解除" icon={<X className="h-4 w-4" />} onClick={() => onChange(null)} />
      </div>
    );
  }

  return (
    <div className="relative">
      <Input placeholder="学校名で検索" value={input} onChange={(event) => setInput(event.target.value)} />
      {input && (schools.data?.schools.length ?? 0) > 0 ? (
        <ul className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-md border border-border-subtle bg-bg-elevated shadow-card">
          {schools.data?.schools.slice(0, 10).map((school) => (
            <li key={school.id}>
              <button type="button" className="min-h-11 w-full px-3 text-left text-sm hover:bg-bg-muted" onClick={() => onChange(school)}>
                {school.name}<span className="ml-2 text-fg-tertiary">{school.prefecture}</span>
              </button>
            </li>
          ))}
          <li className="border-t border-border-subtle px-3 py-2 text-xs text-fg-secondary">リストに無い学校を追加</li>
        </ul>
      ) : null}
    </div>
  );
}
