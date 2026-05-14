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
  const patch = usePatchAttendanceRule({ schoolId, departmentId }, type);
  return (
    <BottomSheet open={open} onClose={onClose} title={type === "default" ? "学校・学科のデフォルト" : "自分の上書き"}>
      <div className="grid gap-3">
        <Field label="公欠"><Select value={excusedStrategy} onChange={(event) => setExcused(event.target.value as RuleStrategy)}>{RULE_STRATEGY.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</Select></Field>
        <Field label="遅刻"><Select value={tardyStrategy} onChange={(event) => setTardy(event.target.value as RuleStrategy)}>{RULE_STRATEGY.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</Select></Field>
        <Field label="早退"><Select value={earlyLeaveStrategy} onChange={(event) => setEarly(event.target.value as RuleStrategy)}>{RULE_STRATEGY.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</Select></Field>
        <Button onClick={() => patch.mutate({ excusedStrategy, tardyStrategy, earlyLeaveStrategy }, { onSuccess: onClose })}>保存</Button>
      </div>
    </BottomSheet>
  );
}
