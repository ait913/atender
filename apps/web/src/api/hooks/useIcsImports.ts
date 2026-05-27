import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, api, ApiError } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { IcsImportCommitResult, IcsImportPreview, IcsImportsResponse } from "./types";

export function useIcsImports(roomId?: string) {
  return useQuery({
    queryKey: QK.icsImports(roomId ?? ""),
    queryFn: () => api<IcsImportsResponse>(`/api/rooms/${roomId}/ics-imports`),
    enabled: Boolean(roomId),
  });
}

export function useIcsImportPreview(roomId?: string, importId?: string) {
  return useQuery({
    queryKey: QK.icsImportPreview(roomId ?? "", importId ?? ""),
    queryFn: () => api<IcsImportPreview>(`/api/rooms/${roomId}/ics-imports/${importId}/preview`),
    enabled: Boolean(roomId && importId),
  });
}

export function useUploadIcsImport(roomId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!roomId) throw new ApiError(400, "ROOM_REQUIRED", "Room id is required");
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/ics-imports`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!response.ok) throw new ApiError(response.status, "UPLOAD_FAILED", await response.text());
      return response.json() as Promise<{ import: { id: string }; parsedCount: number; dedup: boolean }>;
    },
    onSuccess: () => {
      if (roomId) queryClient.invalidateQueries({ queryKey: QK.icsImports(roomId) });
    },
  });
}

export function useCommitIcsImport(roomId?: string, importId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<IcsImportCommitResult>(`/api/rooms/${roomId}/ics-imports/${importId}/commit`, { method: "POST" }),
    onSuccess: () => {
      if (!roomId) return;
      queryClient.invalidateQueries({ queryKey: ["rooms", roomId, "week"] });
      queryClient.invalidateQueries({ queryKey: QK.icsImports(roomId) });
    },
  });
}

export function useDeleteIcsImport(roomId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (importId: string) => api(`/api/rooms/${roomId}/ics-imports/${importId}`, { method: "DELETE" }),
    onSuccess: () => {
      if (!roomId) return;
      queryClient.invalidateQueries({ queryKey: ["rooms", roomId, "week"] });
      queryClient.invalidateQueries({ queryKey: QK.icsImports(roomId) });
    },
  });
}
