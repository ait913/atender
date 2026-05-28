import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateGoogleSyncInput,
  GoogleCalendarConnectionDto,
  GoogleCalendarSyncDto,
  GoogleListedCalendarDto,
  UpdateGoogleSyncInput,
} from "@atender/shared";
import { api, APP_URL } from "@/api/client";
import { QK } from "@/api/queryKeys";
import { authClient } from "@/lib/authClient";

export function useGoogleConnection() {
  return useQuery({
    queryKey: QK.googleConnection(),
    queryFn: () => api<{ connection: GoogleCalendarConnectionDto | null }>("/api/me/google-calendar/connection"),
  });
}

export function useGoogleCalendars() {
  const conn = useGoogleConnection();
  return useQuery({
    queryKey: QK.googleCalendars(),
    queryFn: () => api<{ calendars: GoogleListedCalendarDto[] }>("/api/me/google-calendar/calendars"),
    enabled: conn.data?.connection?.status === "ACTIVE",
    staleTime: 5 * 60 * 1000,
  });
}

export function useGoogleSyncs(roomId?: string) {
  return useQuery({
    queryKey: QK.googleSyncs(roomId ?? ""),
    queryFn: () => api<{ syncs: GoogleCalendarSyncDto[] }>(`/api/rooms/${roomId}/google-calendar-syncs`),
    enabled: Boolean(roomId),
  });
}

export function useLinkGoogleCalendar() {
  return useMutation({
    mutationFn: async () => {
      await authClient.linkSocial({
        provider: "google",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        callbackURL: `${APP_URL}/settings/integrations/google?linked=1`,
      });
    },
  });
}

export function useCompleteGoogleLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ connection: GoogleCalendarConnectionDto }>("/api/me/google-calendar/link/complete", { method: "POST", body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.googleConnection() });
      queryClient.invalidateQueries({ queryKey: QK.googleCalendars() });
    },
  });
}

export function useUnlinkGoogleCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { deleteEvents: boolean }) =>
      api<{ ok: boolean; deletedEvents: number }>("/api/me/google-calendar/connection", {
        method: "DELETE",
        query: { deleteEvents: args.deleteEvents ? "true" : "false" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.googleConnection() });
      queryClient.invalidateQueries({ queryKey: QK.googleCalendars() });
      queryClient.invalidateQueries({ queryKey: QK.rooms() });
    },
  });
}

export function useCreateGoogleSync(roomId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoogleSyncInput) =>
      api<{ sync: GoogleCalendarSyncDto }>(`/api/rooms/${roomId}/google-calendar-syncs`, { method: "POST", body: input }),
    onSuccess: () => {
      if (!roomId) return;
      queryClient.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      queryClient.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useUpdateGoogleSync(roomId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { syncId: string; input: UpdateGoogleSyncInput }) =>
      api<{ sync: GoogleCalendarSyncDto }>(`/api/rooms/${roomId}/google-calendar-syncs/${args.syncId}`, {
        method: "PATCH",
        body: args.input,
      }),
    onSuccess: () => {
      if (!roomId) return;
      queryClient.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      queryClient.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useDeleteGoogleSync(roomId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { syncId: string; deleteEvents: boolean }) =>
      api<{ ok: boolean }>(`/api/rooms/${roomId}/google-calendar-syncs/${args.syncId}`, {
        method: "DELETE",
        query: { deleteEvents: args.deleteEvents ? "true" : "false" },
      }),
    onSuccess: () => {
      if (!roomId) return;
      queryClient.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      queryClient.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useRunGoogleSync(roomId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (syncId: string) =>
      api<{ ok: boolean; upserted?: number; deleted?: number; error?: string }>(`/api/rooms/${roomId}/google-calendar-syncs/${syncId}/run`, {
        method: "POST",
        body: {},
      }),
    onSuccess: () => {
      if (!roomId) return;
      queryClient.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      queryClient.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useRunAllGoogleSyncs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ count: number; results: Array<{ syncId: string; ok: boolean; error?: string }> }>("/api/me/google-calendar/sync-all", {
        method: "POST",
        body: {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.googleConnection() });
      queryClient.invalidateQueries({ queryKey: QK.rooms() });
    },
  });
}
