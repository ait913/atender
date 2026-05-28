import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSemesters } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";

type Props = { semesterId: string | null; onChange: (id: string) => void; trailing?: ReactNode };

export function HomeSemesterPicker({ semesterId, onChange, trailing }: Props) {
  const semesters = useSemesters();
  const current = semesters.data?.semesters.find((semester) => semester.id === semesterId) ?? semesters.data?.semesters[0];
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex min-h-9 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 items-center gap-2 text-base font-bold text-fg-primary hover:text-accent-500"
        >
          <span className="truncate">{current?.name ?? "学期を選択"}</span>
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        </button>
        {trailing ?? null}
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="学期を選択">
        <ul className="space-y-1">
          {(semesters.data?.semesters ?? []).map((semester) => (
            <li key={semester.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(semester.id);
                  setOpen(false);
                }}
                className={`block w-full rounded-2xl px-4 py-3 text-left text-base font-bold transition ${
                  semester.id === current?.id ? "bg-accent-500/15 text-accent-500" : "hover:bg-fg-primary/6"
                }`}
              >
                {semester.name}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
