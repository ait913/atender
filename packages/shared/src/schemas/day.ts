import { z } from "zod";
import { OccurrenceDto } from "./attendance.js";
import { ClassTransferDto } from "./classTransfer.js";
import { CourseSuspensionDto } from "./course.js";
import { TimetableSuspensionDto } from "./timetableSuspension.js";

export const DayDetailDto = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurrences: z.array(OccurrenceDto),
  courseSuspensions: z.array(CourseSuspensionDto),
  timetableSuspension: TimetableSuspensionDto.nullable(),
  transfers: z.array(ClassTransferDto).optional(),
});

export type DayDetailDto = z.infer<typeof DayDetailDto>;
