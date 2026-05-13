import { useState } from "react";
import { api } from "@/api/client";
import { useAttendanceRules, useMe, usePatchMe, useSemesters, useUpsertAttendanceRule } from "@/api/hooks";
import { Button, Field, PageTitle, Panel, ruleLabels, Select } from "@/components/ui";
import type { RuleStrategy } from "@atender/shared";
import { RULE_STRATEGY } from "@atender/shared";

function RuleSelect({ value, onChange }: { value: RuleStrategy; onChange: (value: RuleStrategy) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.currentTarget.value as RuleStrategy)}>
      {RULE_STRATEGY.map((strategy) => <option key={strategy} value={strategy}>{ruleLabels[strategy]}</option>)}
    </Select>
  );
}

export function Settings() {
  const me = useMe();
  const patchMe = usePatchMe();
  const semesters = useSemesters();
  const rules = useAttendanceRules({ schoolId: me.data?.user.schoolId, departmentId: me.data?.user.departmentId });
  const upsertUser = useUpsertAttendanceRule({ schoolId: me.data?.user.schoolId, departmentId: me.data?.user.departmentId }, "user");
  const [name, setName] = useState(me.data?.user.name ?? "");
  const [schoolId, setSchoolId] = useState(me.data?.user.schoolId ?? "");
  const [departmentId, setDepartmentId] = useState(me.data?.user.departmentId ?? "");
  const [rule, setRule] = useState({
    excusedStrategy: rules.data?.effective.excusedStrategy ?? "REDUCE_DENOMINATOR",
    tardyStrategy: rules.data?.effective.tardyStrategy ?? "HALF_PRESENT",
    earlyLeaveStrategy: rules.data?.effective.earlyLeaveStrategy ?? "HALF_PRESENT",
  } satisfies Record<string, RuleStrategy>);

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    window.location.assign("/signin");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <PageTitle title="Settings::">ルール・プロフィール・ログアウト</PageTitle>
      </div>
      <Panel className="space-y-4">
        <h2 className="text-xl font-black">プロフィール</h2>
        <p className="text-sm text-white/62">email: {me.data?.user.email}</p>
        <Field value={name} placeholder="name" onChange={(event) => setName(event.currentTarget.value)} />
        <Select value={me.data?.user.defaultSemesterId ?? ""} onChange={(event) => patchMe.mutate({ defaultSemesterId: event.currentTarget.value })}>
          {(semesters.data?.semesters ?? []).map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
        </Select>
        <Button type="button" variant="primary" onClick={() => patchMe.mutate({ name })} disabled={!name}>保存</Button>
      </Panel>
      <Panel className="space-y-4">
        <h2 className="text-xl font-black">学校・学科変更</h2>
        <p className="text-sm text-white/62">テンプレ検索は新しい学科で行われます</p>
        <Field value={schoolId} placeholder="schoolId" onChange={(event) => setSchoolId(event.currentTarget.value)} />
        <Field value={departmentId} placeholder="departmentId" onChange={(event) => setDepartmentId(event.currentTarget.value)} />
        <Button type="button" onClick={() => patchMe.mutate({ schoolId, departmentId })} disabled={!schoolId || !departmentId}>更新</Button>
      </Panel>
      <Panel className="space-y-4 lg:col-span-2">
        <h2 className="text-xl font-black">AttendanceRule</h2>
        <p className="text-sm text-white/62">学校 + 学科のデフォルトは共有設定です。ここでは自分の上書きを編集します</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-bold">公欠<RuleSelect value={rule.excusedStrategy} onChange={(value) => setRule({ ...rule, excusedStrategy: value })} /></label>
          <label className="text-sm font-bold">遅刻<RuleSelect value={rule.tardyStrategy} onChange={(value) => setRule({ ...rule, tardyStrategy: value })} /></label>
          <label className="text-sm font-bold">早退<RuleSelect value={rule.earlyLeaveStrategy} onChange={(value) => setRule({ ...rule, earlyLeaveStrategy: value })} /></label>
        </div>
        <Button type="button" variant="primary" onClick={() => upsertUser.mutate(rule)} disabled={!me.data?.user.schoolId || !me.data?.user.departmentId}>自分の上書きを保存</Button>
      </Panel>
      <Panel className="space-y-4 lg:col-span-2">
        <h2 className="text-xl font-black">サインアウト</h2>
        <Button type="button" variant="danger" onClick={signOut}>ログアウト</Button>
      </Panel>
    </div>
  );
}
