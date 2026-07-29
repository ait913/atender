import { z } from "zod";

export const WeekdayCode = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
export type WeekdayCode = z.infer<typeof WeekdayCode>;

export const RecurrenceEnd = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("never") }),
  z.object({ kind: z.literal("until"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), // JST 日付・その日を含む
  z.object({ kind: z.literal("count"), count: z.number().int().min(1).max(730) }),
]);
export type RecurrenceEnd = z.infer<typeof RecurrenceEnd>;

export const RecurrenceSpec = z.object({
  freq: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().min(1).max(99).default(1),
  byDay: z.array(WeekdayCode).max(7).default([]),                 // WEEKLY のときのみ意味を持つ
  monthlyMode: z.enum(["BYMONTHDAY", "BYDAY"]).nullable().default(null), // MONTHLY のときのみ
  end: RecurrenceEnd.default({ kind: "never" }),
});
export type RecurrenceSpec = z.infer<typeof RecurrenceSpec>;
