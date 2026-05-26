import type { Query } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type InvalidateTarget = readonly unknown[] | { predicate: (query: Query) => boolean } | "clear";

export function useApiMutation<TVars, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
  invalidate: InvalidateTarget[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const target of invalidate) {
        if (target === "clear") {
          queryClient.clear();
        } else if (Array.isArray(target)) {
          void queryClient.invalidateQueries({ queryKey: target });
        } else if ("predicate" in target) {
          void queryClient.invalidateQueries({ predicate: target.predicate });
        }
      }
    },
  });
}
