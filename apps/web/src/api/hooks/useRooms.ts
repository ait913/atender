import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { CreateRoomInput, RoomInviteResponse, RoomMembersResponse, RoomResponse, RoomsResponse, UpdateRoomInput } from "./types";

export function useRooms() {
  return useQuery({ queryKey: QK.rooms(), queryFn: () => api<RoomsResponse>("/api/rooms") });
}

export function useRoom(id?: string) {
  return useQuery({ queryKey: QK.room(id ?? ""), queryFn: () => api<RoomResponse>(`/api/rooms/${id}`), enabled: Boolean(id) });
}

export function useRoomMembers(id?: string) {
  return useQuery({ queryKey: QK.roomMembers(id ?? ""), queryFn: () => api<RoomMembersResponse>(`/api/rooms/${id}/members`), enabled: Boolean(id) });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRoomInput) => api<RoomResponse>("/api/rooms", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.rooms() }),
  });
}

export function useUpdateRoom(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateRoomInput) => api<RoomResponse>(`/api/rooms/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.rooms() });
      if (id) queryClient.invalidateQueries({ queryKey: QK.room(id) });
    },
  });
}

export function useJoinRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => api<RoomResponse>("/api/rooms/join", { method: "POST", body: { inviteCode } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.rooms() }),
  });
}

type RoomActionResult = { ok: true } | { inviteCode: string; inviteExpiresAt: string };
export function useRoomAction(id?: string, action: "leave" | "delete" | "invite" = "leave") {
  const queryClient = useQueryClient();
  return useMutation<RoomActionResult, Error, void>({
    mutationFn: async () => {
      if (action === "delete") return api<{ ok: true }>(`/api/rooms/${id}`, { method: "DELETE" });
      if (action === "invite") return api<{ inviteCode: string; inviteExpiresAt: string }>(`/api/rooms/${id}/invite`, { method: "POST" });
      return api<{ ok: true }>(`/api/rooms/${id}/leave`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.rooms() });
      if (id) queryClient.invalidateQueries({ queryKey: QK.room(id) });
    },
  });
}

export function useRegenerateRoomInvite(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<RoomInviteResponse>(`/api/rooms/${id}/invite`, { method: "POST" }),
    onSuccess: () => {
      if (id) queryClient.invalidateQueries({ queryKey: QK.room(id) });
    },
  });
}
