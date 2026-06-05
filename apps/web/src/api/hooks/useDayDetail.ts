import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { DayDetailResponse } from "./types";

export function useDayDetail(date: string | null | undefined) {
  return useQuery({
    queryKey: QK.dayDetail(date),
    queryFn: () => api<DayDetailResponse>(`/api/day/${date}`),
    enabled: Boolean(date),
  });
}
