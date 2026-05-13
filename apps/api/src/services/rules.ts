import type { AttendanceRule, RuleStrategy } from "@prisma/client";
import { prisma } from "../db";

export type EffectiveRule = {
  default: AttendanceRule | null;
  userOverride: AttendanceRule | null;
  effective: {
    excusedStrategy: RuleStrategy;
    tardyStrategy: RuleStrategy;
    earlyLeaveStrategy: RuleStrategy;
  };
};

export const systemDefaultRule = {
  excusedStrategy: "REDUCE_DENOMINATOR",
  tardyStrategy: "HALF_PRESENT",
  earlyLeaveStrategy: "HALF_PRESENT",
} satisfies EffectiveRule["effective"];

export async function getEffectiveRule(args: {
  schoolId: string;
  departmentId: string;
  userId: string;
}): Promise<EffectiveRule> {
  const [defaultRule, userOverride] = await Promise.all([
    prisma.attendanceRule.findFirst({
      where: { schoolId: args.schoolId, departmentId: args.departmentId, userId: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.attendanceRule.findUnique({
      where: { schoolId_departmentId_userId: { schoolId: args.schoolId, departmentId: args.departmentId, userId: args.userId } },
    }),
  ]);
  const source = userOverride ?? defaultRule;
  return {
    default: defaultRule,
    userOverride,
    effective: {
      excusedStrategy: source?.excusedStrategy ?? systemDefaultRule.excusedStrategy,
      tardyStrategy: source?.tardyStrategy ?? systemDefaultRule.tardyStrategy,
      earlyLeaveStrategy: source?.earlyLeaveStrategy ?? systemDefaultRule.earlyLeaveStrategy,
    },
  };
}
