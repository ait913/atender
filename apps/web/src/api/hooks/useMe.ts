import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MeUpdateInput) => api<MeResponse>("/api/me", { method: "PATCH", body }),
    onSuccess: (data) => {
      queryClient.setQueryData(QK.me(), data);
      queryClient.invalidateQueries({ queryKey: ["users", "search"] });
    },
  });
}
