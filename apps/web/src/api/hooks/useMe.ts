import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { MeResponse, MeUpdateInput } from "./types";

export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: () => api<MeResponse>("/api/me"),
  retry: false,
});

export function useMe() {
  return useQuery(meQueryOptions);
}

export function usePatchMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MeUpdateInput) => api<MeResponse>("/api/me", { method: "PATCH", body }),
    onSuccess: (data) => queryClient.setQueryData(["me"], data),
  });
}
