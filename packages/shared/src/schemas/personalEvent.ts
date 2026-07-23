import { z } from "zod";

export const PersonalEventDto = z.object({
  id: z.string(),
  semesterId: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string(),
  isAllDay: z.boolean(),
  startMinute: z.number().int().nullable(),
  endMinute: z.number().int().nullable(),
  color: z.string().nullable(),
  note: z.string().nullable(),
  source: z.enum(["MANUAL", "EVENTKIT"]).default("MANUAL"),
  ekExternalId: z.string().nullable().default(null),
  ekCalendarId: z.string().nullable().default(null),
  ekLastModified: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const timeRefine = (v: { isAllDay?: boolean; startMinute?: number | null; endMinute?: number | null }) => {
  if (v.isAllDay !== false) return true;
  if (v.startMinute == null || v.endMinute == null) return false;
  return v.startMinute >= 0 && v.endMinute <= 1440 && v.startMinute <= v.endMinute;
};

const PersonalEventInputBase = z.object({
  semesterId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(100),
  isAllDay: z.boolean().default(true),
  startMinute: z.number().int().min(0).max(1440).nullable().optional(),
  endMinute: z.number().int().min(0).max(1440).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  note: z.string().max(500).optional(),
  source: z.enum(["MANUAL", "EVENTKIT"]).optional(),
  ekExternalId: z.string().optional(),
  ekCalendarId: z.string().optional(),
  ekLastModified: z.string().datetime().optional(),
});

export const PersonalEventCreateInput = PersonalEventInputBase.refine(timeRefine, {
  message: "time range required when not all-day",
});

export const PersonalEventUpdateInput = PersonalEventInputBase.partial().refine(timeRefine, {
  message: "time range required when not all-day",
});

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const EventKitSyncEvent = z.object({
  ekExternalId: z.string(),
  ekCalendarId: z.string(),
  ekLastModified: z.string().datetime().nullable(),
  date: DateStr,
  title: z.string().min(1).max(100),
  isAllDay: z.boolean(),
  startMinute: z.number().int().min(0).max(1440).nullable(),
  endMinute: z.number().int().min(0).max(1440).nullable(),
});

export const EventKitSyncInput = z.object({
  range: z.object({ from: DateStr, to: DateStr }),
  events: z.array(EventKitSyncEvent),
});

export type PersonalEventDto = z.infer<typeof PersonalEventDto>;
export type PersonalEventCreateInput = z.infer<typeof PersonalEventCreateInput>;
export type PersonalEventUpdateInput = z.infer<typeof PersonalEventUpdateInput>;
export type EventKitSyncEvent = z.infer<typeof EventKitSyncEvent>;
export type EventKitSyncInput = z.infer<typeof EventKitSyncInput>;
