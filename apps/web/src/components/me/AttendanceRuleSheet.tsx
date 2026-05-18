import { useState } from "react";
import { RULE_STRATEGY, type RuleStrategy } from "@atender/shared";
import { usePatchAttendanceRule } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Select } from "@/components/ui";

const labels: Record<RuleStrategy, string> = {
  COUNT_AS_PRESENT: "出席扱い",
  COUNT_AS_ABSENT: "欠席扱い",
  HALF_PRESENT: "半分出席",
  REDUCE_DENOMINATOR: "分母から除外",
  SEPARATE_COUNT: "別集計",
};

export function AttendanceRuleSheet({ open, onClose, schoolId, departmentId, type }: { open: boolean; onClose: () => void; schoolId?: string | null; departmentId?: string | null; type: "default" | "user" }) {
  const [excusedStrategy, setExcused] = useState<RuleStrategy>("REDUCE_DENOMINATOR");
  const [tardyStrategy, setTardy] = useState<RuleStrategy>("HALF_PRESENT");
  const [earlyLeaveStrategy, setEarly] = useState<RuleStrategy>("HALF_PRESENT");
  const [error, setError] = useState<string | null>(null);
  const patch = usePatchAttendanceRule({ schoolId, departmentId }, type);
  return (
    <BottomSheet open={open} onClose={onClose} title={type === "default" ? "学校・学科のデフォルト" : "自分の上書き"} closeDisabled={patch.isPending}>
      <div className="space-y-5">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-status-absent">{error}</p> : null}
        <section className="space-y-4">
          <Field label="公欠"><Select value={excusedStrategy} disabled={patch.isPending} onChange={(event) => setExcused(event.target.value as RuleStrategy)}>{RULE_STRATEGY.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</Select></Field>
          <Field label="遅刻"><Select value={tardyStrategy} disabled={patch.isPending} onChange={(event) => setTardy(event.target.value as RuleStrategy)}>{RULE_STRATEGY.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</Select></Field>
          <Field label="早退"><Select value={earlyLeaveStrategy} disabled={patch.isPending} onChange={(event) => setEarly(event.target.value as RuleStrategy)}>{RULE_STRATEGY.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</Select></Field>
        </section>
        <footer className="sticky bottom-0 -mx-5 px-5 py-3 border-t border-border-subtle bg-bg-elevated" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          <div className="flex gap-3">
            <Button className="flex-1" disabled={patch.isPending} onClick={() => { setError(null); patch.mutate({ excusedStrategy, tardyStrategy, earlyLeaveStrategy }, { onSuccess: onClose, onError: () => setError("保存できませんでした") }); }}>{patch.isPending ? "保存中..." : "保存"}</Button>
          </div>
        </footer>
      </div>
    </BottomSheet>
  );
}
