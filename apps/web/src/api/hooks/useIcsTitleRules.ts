import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { IcsTitleRuleResponse, IcsTitleRulesResponse } from "./types";

export type TitleRuleInput = {
  matchType: "EQUALS" | "CONTAINS" | "REGEX";
  pattern: string;
  replaceWith?: string | null;
  visibilityMode?: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  priority?: number;
};

export function useIcsTitleRules() {
  return useQuery({
    queryKey: QK.icsTitleRules(),
    queryFn: () => api<IcsTitleRulesResponse>("/api/me/ics-title-rules"),
  });
}

export function useCreateIcsTitleRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TitleRuleInput) => api<IcsTitleRuleResponse>("/api/me/ics-title-rules", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.icsTitleRules() }),
  });
}

export function usePatchIcsTitleRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TitleRuleInput> }) => api<IcsTitleRuleResponse>(`/api/me/ics-title-rules/${id}`, { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.icsTitleRules() }),
  });
}

export function useDeleteIcsTitleRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/me/ics-title-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.icsTitleRules() }),
  });
}
