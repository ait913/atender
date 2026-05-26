import { useEffect, useState } from "react";
import type { RuleStrategy } from "@atender/shared";
import { RULE_STRATEGY } from "@atender/shared";
import { useAttendanceRules, useMe, useUpsertAttendanceRule } from "@/api/hooks";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { Button, Field, Select, ruleLabels } from "@/components/ui";

export function AttendanceRuleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const rules = useAttendanceRules({ schoolId: me.data?.user.schoolId, departmentId: me.data?.user.departmentId });
  const upsert = useUpsertAttendanceRule({ schoolId: me.data?.user.schoolId, departmentId: me.data?.user.departmentId }, "user");
  const [rule, setRule] = useState<Record<"excusedStrategy" | "tardyStrategy" | "earlyLeaveStrategy", RuleStrategy>>({
    excusedStrategy: "REDUCE_DENOMINATOR",
    tardyStrategy: "HALF_PRESENT",
    earlyLeaveStrategy: "HALF_PRESENT",
  });
  useEffect(() => {
    if (!rules.data?.effective) return;
    setRule({
      excusedStrategy: rules.data.effective.excusedStrategy,
      tardyStrategy: rules.data.effective.tardyStrategy,
      earlyLeaveStrategy: rules.data.effective.earlyLeaveStrategy,
    });
  }, [rules.data?.effective, open]);
  return (
    <BottomSheet open={open} onClose={onClose} title="出欠ルール">
      {(["excusedStrategy", "tardyStrategy", "earlyLeaveStrategy"] as const).map((key) => (
        <Field key={key} label={{ excusedStrategy: "公欠", tardyStrategy: "遅刻", earlyLeaveStrategy: "早退" }[key]}>
          <Select value={rule[key]} onChange={(event) => setRule({ ...rule, [key]: event.currentTarget.value as RuleStrategy })}>
            {RULE_STRATEGY.map((strategy) => <option key={strategy} value={strategy}>{ruleLabels[strategy]}</option>)}
          </Select>
        </Field>
      ))}
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-border-subtle bg-bg-elevated px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button type="button" variant="primary" onClick={() => upsert.mutate(rule, { onSuccess: onClose })}>保存</Button>
      </div>
    </BottomSheet>
  );
}
