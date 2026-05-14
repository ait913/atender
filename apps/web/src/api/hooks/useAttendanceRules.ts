import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK, QP } from "@/api/queryKeys";
import type { AttendanceRuleUpsertInput } from "@atender/shared";
import type { EffectiveRuleResponse, OkResponse, RuleResponse } from "./types";
import { useApiMutation } from "./useApiMutation";

type Scope = { schoolId?: string | null; departmentId?: string | null };

export function useAttendanceRules(scope: Scope) {
  const schoolId = scope.schoolId ?? "none";
  const departmentId = scope.departmentId ?? "none";
  return useQuery({
    queryKey: QK.rules(schoolId, departmentId),
    enabled: Boolean(scope.schoolId && scope.departmentId),
    queryFn: () => api<EffectiveRuleResponse>("/api/attendance-rules", { query: scope }),
  });
}

export function usePatchAttendanceRule(scope: Scope, type: "default" | "user") {
  const invalidate = scope.schoolId && scope.departmentId ? [QK.rules(scope.schoolId, scope.departmentId), { predicate: QP.stats }] : [{ predicate: QP.stats }];
  return useApiMutation<AttendanceRuleUpsertInput, RuleResponse>(
    (body) => api<RuleResponse>(`/api/attendance-rules/${type}`, { method: "PATCH", body: { ...body, ...scope } }),
    invalidate,
  );
}

export function useDeleteUserAttendanceRule(scope: Scope) {
  const invalidate = scope.schoolId && scope.departmentId ? [QK.rules(scope.schoolId, scope.departmentId), { predicate: QP.stats }] : [{ predicate: QP.stats }];
  return useApiMutation<void, OkResponse>(
    () => api<OkResponse>("/api/attendance-rules/user", { method: "DELETE", query: scope }),
    invalidate,
  );
}

export const useUpsertAttendanceRule = usePatchAttendanceRule;
