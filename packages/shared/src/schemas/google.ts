import { z } from "zod";

export const GoogleCalendarConnectionDto = z.object({
  id: z.string(),
  googleEmail: z.string(),
  scope: z.string(),
  status: z.enum(["ACTIVE", "REVOKED", "ERROR"]),
  lastError: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const GoogleListedCalendarDto = z.object({
  id: z.string(),
  summary: z.string(),
  timeZone: z.string(),
  accessRole: z.enum(["owner", "writer", "reader", "freeBusyReader"]),
  primary: z.boolean(),
  backgroundColor: z.string().nullable(),
});

export const GoogleCalendarSyncDto = z.object({
  id: z.string(),
  googleCalendarId: z.string(),
  calendarSummary: z.string(),
  calendarTimeZone: z.string(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]),
  status: z.enum(["IDLE", "SYNCING", "OK", "FAILED", "REVOKED"]),
  lastError: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  hasSyncToken: z.boolean(),
});

export const CreateGoogleSyncInput = z.object({
  googleCalendarId: z.string().min(1).max(500),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).default("TITLE_MAPPED"),
});

export const UpdateGoogleSyncInput = z.object({
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).optional(),
  enabled: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "at least one field required" });

export type GoogleCalendarConnectionDto = z.infer<typeof GoogleCalendarConnectionDto>;
export type GoogleListedCalendarDto = z.infer<typeof GoogleListedCalendarDto>;
export type GoogleCalendarSyncDto = z.infer<typeof GoogleCalendarSyncDto>;
export type CreateGoogleSyncInput = z.infer<typeof CreateGoogleSyncInput>;
export type UpdateGoogleSyncInput = z.infer<typeof UpdateGoogleSyncInput>;
