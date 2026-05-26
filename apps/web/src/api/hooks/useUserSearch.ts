import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { UsersSearchResponse } from "./types";

export function useUserSearch(handle: string) {
  return useQuery({
    queryKey: QK.usersSearch(handle),
    queryFn: () => api<UsersSearchResponse>("/api/users/search", { query: { handle } }),
    enabled: handle.trim().length > 0,
  });
}
