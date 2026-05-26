import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { CreateFriendshipInput, FriendshipResponse, FriendshipsResponse } from "./types";

export function useFriendships(query: { status?: string; direction?: "sent" | "received" | "all" } = {}) {
  return useQuery({
    queryKey: QK.friendships(query),
    queryFn: () => api<FriendshipsResponse>("/api/friendships", { query }),
  });
}

export function usePendingFriendshipCount() {
  return useQuery({
    queryKey: QK.friendshipsPendingCount(),
    queryFn: async () => {
      const data = await api<FriendshipsResponse>("/api/friendships", { query: { status: "PENDING", direction: "received" } });
      return data.friendships.length;
    },
    refetchInterval: 60_000,
  });
}

export function useCreateFriendship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFriendshipInput) => api<FriendshipResponse>("/api/friendships", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendships"] });
      queryClient.invalidateQueries({ queryKey: ["users", "search"] });
    },
  });
}

export function useFriendshipAction(action: "accept" | "decline" | "cancel" | "block" | "delete") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      action === "delete"
        ? api<{ ok: true }>(`/api/friendships/${id}`, { method: "DELETE" })
        : api<FriendshipResponse | { ok: true }>(`/api/friendships/${id}/${action}`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["friendships"] }),
  });
}
