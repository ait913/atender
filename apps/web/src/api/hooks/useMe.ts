import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK, QP } from "@/api/queryKeys";
import type { MeResponse, MeUpdateInput } from "./types";
import { useApiMutation } from "./useApiMutation";

export const meQueryOptions = queryOptions({
  queryKey: QK.me(),
  queryFn: () => api<MeResponse>("/api/me"),
  retry: false,
});

export function useMe() {
  return useQuery(meQueryOptions);
}

export function usePatchMe() {
  return useApiMutation<MeUpdateInput, MeResponse>((body) => api<MeResponse>("/api/me", { method: "PATCH", body }), [
    QK.me(),
    QK.session(),
    { predicate: QP.templates },
  ]);
}

export function useSignOut() {
  return useApiMutation<void, unknown>(() => api("/api/auth/sign-out", { method: "POST" }), [QK.session(), QK.me(), "clear"]);
}
