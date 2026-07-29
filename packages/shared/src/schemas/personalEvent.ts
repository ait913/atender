import { z } from "zod";
import { RecurrenceSpec } from "./recurrence.js";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** occurrence が覆う JST 1 日ぶんの表示情報。クライアントは日付演算をしない */
export const OccurrenceDayDto = z.object({
  date: DateStr,
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

/** 系列そのもの (POST/PATCH のレスポンス、編集フォームの原本) */
export const PersonalEventSeriesDto = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),                       // ISO8601 instant
  end: z.string(),                         // ISO8601 instant (排他)
  isAllDay: z.boolean(),
  location: z.string().nullable(),
  note: z.string().nullable(),
  color: z.string().nullable(),
  recurrenceRule: z.string().nullable(),
  recurrenceSpec: RecurrenceSpec.nullable(),   // 表現できない RRULE は null
  exDates: z.array(z.string()).default([]),    // ISO8601 instant
  rDates: z.array(z.string()).default([]),
  source: z.enum(["MANUAL", "EVENTKIT"]),
  ekExternalId: z.string().nullable(),
  ekCalendarId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 展開済み occurrence (GET のレスポンス、カレンダー描画の単位) */
export const PersonalEventOccurrenceDto = z.object({
  seriesId: z.string(),
  occurrenceDate: z.string(),              // override 適用前の開始 (RECURRENCE-ID 相当)
  start: z.string(),                       // override 適用後
  end: z.string(),                         // override 適用後・排他
  days: z.array(OccurrenceDayDto).min(1),  // ★ クエリ範囲でクリップ済
  isAllDay: z.boolean(),
  title: z.string(),
  location: z.string().nullable(),
  note: z.string().nullable(),
  color: z.string().nullable(),
  isRecurringOccurrence: z.boolean(),
  recurrenceRule: z.string().nullable(),
  recurrenceSpec: RecurrenceSpec.nullable(),
  overrideId: z.string().nullable(),
  source: z.enum(["MANUAL", "EVENTKIT"]),
  ekExternalId: z.string().nullable(),
  ekCalendarId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PersonalEventRecurrenceInput = z.object({
  spec:    RecurrenceSpec.optional(),
  rrule:   z.string().min(1).max(720).optional(),   // import 経路用。UI からは使わない
  exDates: z.array(z.string().datetime()).default([]),
  rDates:  z.array(z.string().datetime()).default([]),
}).refine((v) => (v.spec != null) !== (v.rrule != null), {
  message: "recurrence requires exactly one of spec or rrule",
});

/** .partial() / .extend() のために refine 前の ZodObject を別名で持つ */
export const PersonalEventCreateInputShape = z.object({
  title:      z.string().min(1).max(100),
  start:      z.string().datetime(),
  end:        z.string().datetime(),
  isAllDay:   z.boolean().default(false),
  location:   z.string().max(200).nullable().optional(),
  note:       z.string().max(500).nullable().optional(),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  recurrence: PersonalEventRecurrenceInput.optional(),
  source:         z.enum(["MANUAL", "EVENTKIT"]).optional(),
  ekExternalId:   z.string().optional(),
  ekCalendarId:   z.string().optional(),
  ekLastModified: z.string().datetime().optional(),
});

export const PersonalEventCreateInput = PersonalEventCreateInputShape.refine(
  (v) => v.isAllDay || new Date(v.end) > new Date(v.start),
  { message: "end must be after start" },
);

export const PersonalEventUpdateInput = PersonalEventCreateInputShape.partial().extend({
  editScope:       z.enum(["single", "future", "all"]).default("all"),
  originalDate:    z.string().datetime().optional(),
  clearRecurrence: z.boolean().optional(),
});

export const PersonalEventDeleteQuery = z.object({
  scope:        z.enum(["single", "future", "all"]).default("all"),
  originalDate: z.string().datetime().optional(),
});

export const EventKitSyncEvent = z.object({
  ekExternalId:      z.string(),
  ekCalendarId:      z.string(),
  ekOccurrenceStart: z.string().datetime(),          // EKEvent.occurrenceDate
  ekLastModified:    z.string().datetime().nullable(),
  start:             z.string().datetime(),
  end:               z.string().datetime(),
  isAllDay:          z.boolean(),
  title:             z.string().min(1).max(100),
  location:          z.string().max(200).nullable(),
});

export const EventKitSyncInput = z.object({
  range:  z.object({ from: DateStr, to: DateStr }),
  events: z.array(EventKitSyncEvent),
});

/** build 11 以前の EK push 済みイベント掃除 (.designs/20260729-eventkit-dedicated-calendar-export.md §4.4) */
export const LegacyEkPushListDto  = z.object({ externalIds: z.array(z.string()) });
export const LegacyEkPushClearInput = z.object({ externalIds: z.array(z.string()).max(2000) });
export const LegacyEkPushClearDto  = z.object({ clearedCount: z.number().int() });

export type OccurrenceDayDto = z.infer<typeof OccurrenceDayDto>;
export type PersonalEventSeriesDto = z.infer<typeof PersonalEventSeriesDto>;
export type PersonalEventOccurrenceDto = z.infer<typeof PersonalEventOccurrenceDto>;
export type PersonalEventRecurrenceInput = z.infer<typeof PersonalEventRecurrenceInput>;
export type PersonalEventCreateInput = z.infer<typeof PersonalEventCreateInput>;
export type PersonalEventUpdateInput = z.infer<typeof PersonalEventUpdateInput>;
export type PersonalEventDeleteQuery = z.infer<typeof PersonalEventDeleteQuery>;
export type EventKitSyncEvent = z.infer<typeof EventKitSyncEvent>;
export type EventKitSyncInput = z.infer<typeof EventKitSyncInput>;
export type LegacyEkPushListDto = z.infer<typeof LegacyEkPushListDto>;
export type LegacyEkPushClearInput = z.infer<typeof LegacyEkPushClearInput>;
export type LegacyEkPushClearDto = z.infer<typeof LegacyEkPushClearDto>;
