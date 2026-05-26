import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { StatsResponse } from "./types";

export function useStats(semesterId?: string | null) {
  return useQuery({
    queryKey: ["stats", semesterId],
    enabled: Boolean(semesterId),
    queryFn: () => api<StatsResponse>("/api/stats", { query: { semesterId } }),
  });
}
