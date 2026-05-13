import { z } from "zod";
import { RULE_STRATEGY } from "../enums";

export const AttendanceRuleDto = z.object({
  id: z.string(),
  schoolId: z.string(),
  departmentId: z.string(),
  userId: z.string().nullable(),
  excusedStrategy: z.enum(RULE_STRATEGY),
  tardyStrategy: z.enum(RULE_STRATEGY),
  earlyLeaveStrategy: z.enum(RULE_STRATEGY),
});

export const AttendanceRuleUpsertInput = z.object({
  excusedStrategy: z.enum(RULE_STRATEGY),
  tardyStrategy: z.enum(RULE_STRATEGY),
  earlyLeaveStrategy: z.enum(RULE_STRATEGY),
});

export const EffectiveRuleResponse = z.object({
  default: AttendanceRuleDto.nullable(),
  userOverride: AttendanceRuleDto.nullable(),
  effective: z.object({
    excusedStrategy: z.enum(RULE_STRATEGY),
    tardyStrategy: z.enum(RULE_STRATEGY),
    earlyLeaveStrategy: z.enum(RULE_STRATEGY),
  }),
});

export type AttendanceRuleDto = z.infer<typeof AttendanceRuleDto>;
export type AttendanceRuleUpsertInput = z.infer<typeof AttendanceRuleUpsertInput>;
export type EffectiveRuleResponse = z.infer<typeof EffectiveRuleResponse>;
