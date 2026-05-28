import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { SemesterOverviewDto } from "@atender/shared";

export function useSemesterOverview(semesterId: string | null | undefined) {
  return useQuery({
    queryKey: QK.semesterOverview(semesterId ?? ""),
    queryFn: () => api<SemesterOverviewDto>(`/api/semesters/${semesterId}/overview`),
    enabled: Boolean(semesterId),
  });
}
