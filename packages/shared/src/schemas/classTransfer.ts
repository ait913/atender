import { z } from "zod";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ClassTransferCreateInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("MOVE_DAY"),
    date: IsoDate,
    semesterId: z.string().optional(),
    sourceDayOfWeek: z.number().int().min(0).max(6),
    suspendSourceDate: z.boolean().default(false),
    sourceDate: IsoDate.optional(),
    liftTargetSuspension: z.boolean().default(false),
    note: z.string().max(100).optional(),
  }),
  z.object({
    kind: z.literal("SINGLE"),
    date: IsoDate,
    semesterId: z.string().optional(),
    courseId: z.string(),
    periodIndexes: z.array(z.number().int().min(1).max(12)).min(1).max(12),
    liftTargetSuspension: z.boolean().default(false),
    note: z.string().max(100).optional(),
  }),
]);

export const ClassTransferDisplacedDto = z.object({
  meetingId: z.string(),
  courseId: z.string(),
  courseName: z.string(),
  startPeriodIndex: z.number().int(),
  periodCount: z.number().int(),
});

export const ClassTransferDto = z.object({
  id: z.string(),
  userTimetableId: z.string(),
  date: IsoDate,
  kind: z.enum(["MOVE_DAY", "SINGLE"]),
  sourceDayOfWeek: z.number().int().nullable(),
  sourceDate: IsoDate.nullable(),
  note: z.string().nullable(),
  occurrenceIds: z.array(z.string()),
  displaced: z.array(ClassTransferDisplacedDto),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ClassTransferDeleteResponse = z.object({
  removedOccurrences: z.number().int(),
  removedAttendanceRecords: z.number().int(),
  restoredOccurrences: z.number().int(),
});

export const ClassTransferResponse = z.object({ transfer: ClassTransferDto });

export type ClassTransferCreateInput = z.infer<typeof ClassTransferCreateInput>;
export type ClassTransferDisplacedDto = z.infer<typeof ClassTransferDisplacedDto>;
export type ClassTransferDto = z.infer<typeof ClassTransferDto>;
export type ClassTransferDeleteResponse = z.infer<typeof ClassTransferDeleteResponse>;
export type ClassTransferResponse = z.infer<typeof ClassTransferResponse>;
