import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { StatsResponse } from "./types";

export function useStats(semesterId?: string | null) {
  return useQuery({
    queryKey: QK.stats(semesterId ?? "none"),
    enabled: Boolean(semesterId),
    queryFn: () => api<StatsResponse>("/api/stats", { query: { semesterId } }),
  });
}
