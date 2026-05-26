import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { AttendanceRuleUpsertInput } from "@atender/shared";
import type { EffectiveRuleResponse, RuleResponse } from "./types";

type Scope = { schoolId?: string | null; departmentId?: string | null };

export function useAttendanceRules(scope: Scope) {
  return useQuery({
    queryKey: QK.rules(scope),
    enabled: Boolean(scope.schoolId && scope.departmentId),
    queryFn: () => api<EffectiveRuleResponse>("/api/attendance-rules", { query: scope }),
  });
}

export function useUpsertAttendanceRule(scope: Scope, type: "default" | "user") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AttendanceRuleUpsertInput) => api<RuleResponse>(`/api/attendance-rules/${type}`, { method: "PATCH", body: { ...body, ...scope } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance-rules"] }),
  });
}
