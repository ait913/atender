import { z } from "zod";
import { SCHOOL_KIND } from "../enums";

export const SchoolDto = z.object({
  id: z.string(),
  mextCode: z.string().nullable(),
  kind: z.enum(SCHOOL_KIND),
  name: z.string(),
  nameKana: z.string().nullable(),
  prefecture: z.string().nullable(),
});

export const SchoolSearchQuery = z.object({
  q: z.string().min(1).max(100).optional(),
  prefecture: z.string().max(20).optional(),
  kind: z.enum(SCHOOL_KIND).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const SchoolCreateInput = z.object({
  name: z.string().min(1).max(100),
  nameKana: z.string().max(100).optional(),
  kind: z.enum(SCHOOL_KIND),
  prefecture: z.string().max(20).optional(),
});

export const DepartmentDto = z.object({
  id: z.string(),
  schoolId: z.string(),
  name: z.string(),
  nameKana: z.string().nullable(),
});

export const DepartmentCreateInput = z.object({
  name: z.string().min(1).max(100),
  nameKana: z.string().max(100).optional(),
});

export type SchoolDto = z.infer<typeof SchoolDto>;
export type SchoolSearchQuery = z.infer<typeof SchoolSearchQuery>;
export type SchoolCreateInput = z.infer<typeof SchoolCreateInput>;
export type DepartmentDto = z.infer<typeof DepartmentDto>;
export type DepartmentCreateInput = z.infer<typeof DepartmentCreateInput>;
