import { prisma } from "../db";
import { AppError } from "../lib/appError";

type RuleLike = {
  id: string;
  matchType: string;
  pattern: string;
  replaceWith: string | null;
  visibilityMode: string;
};

export type AppliedRule = {
  title: string;
  visibilityMode: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  ruleId: string | null;
  rawTitle: string;
};

export function applyTitleRules(rawTitle: string, rules: RuleLike[]): AppliedRule {
  for (const rule of rules) {
    if (!matches(rule.matchType, rule.pattern, rawTitle)) continue;
    return {
      title: rule.replaceWith ?? "予定",
      visibilityMode: rule.visibilityMode as AppliedRule["visibilityMode"],
      ruleId: rule.id,
      rawTitle,
    };
  }
  return { title: rawTitle, visibilityMode: "NORMAL", ruleId: null, rawTitle };
}

function matches(matchType: string, pattern: string, target: string) {
  if (matchType === "EQUALS") return target === pattern;
  if (matchType === "CONTAINS") return target.includes(pattern);
  if (matchType === "REGEX") {
    try {
      return new RegExp(pattern).test(target);
    } catch {
      return false;
    }
  }
  return false;
}

export async function ensureDefaultRule(userId: string) {
  const existing = await prisma.icsTitleRule.findFirst({ where: { userId, isDefault: true } });
  if (existing) return existing;
  return prisma.icsTitleRule.create({
    data: {
      userId,
      matchType: "REGEX",
      pattern: ".*",
      replaceWith: "予定",
      visibilityMode: "TITLE_MAPPED",
      priority: 9999,
      isDefault: true,
    },
  });
}

export function listRules(userId: string) {
  return prisma.icsTitleRule.findMany({ where: { userId }, orderBy: { priority: "asc" } });
}

export async function createRule(userId: string, input: {
  matchType: "EQUALS" | "CONTAINS" | "REGEX";
  pattern: string;
  replaceWith?: string | null;
  visibilityMode?: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  priority?: number;
}) {
  validateRegex(input.matchType, input.pattern);
  return prisma.icsTitleRule.create({
    data: {
      userId,
      matchType: input.matchType,
      pattern: input.pattern,
      replaceWith: input.replaceWith ?? "予定",
      visibilityMode: input.visibilityMode ?? "TITLE_MAPPED",
      priority: input.priority ?? 100,
      isDefault: false,
    },
  });
}

export async function patchRule(userId: string, ruleId: string, patch: {
  matchType?: "EQUALS" | "CONTAINS" | "REGEX";
  pattern?: string;
  replaceWith?: string | null;
  visibilityMode?: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  priority?: number;
}) {
  const rule = await prisma.icsTitleRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.userId !== userId) throw new AppError(404, "NOT_FOUND", "Rule not found");
  if (rule.isDefault) throw new AppError(409, "DEFAULT_RULE_LOCKED", "Default rule cannot be edited");
  validateRegex(patch.matchType ?? rule.matchType, patch.pattern ?? rule.pattern);
  return prisma.icsTitleRule.update({
    where: { id: ruleId },
    data: {
      ...(patch.matchType !== undefined ? { matchType: patch.matchType } : {}),
      ...(patch.pattern !== undefined ? { pattern: patch.pattern } : {}),
      ...(patch.replaceWith !== undefined ? { replaceWith: patch.replaceWith } : {}),
      ...(patch.visibilityMode !== undefined ? { visibilityMode: patch.visibilityMode } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    },
  });
}

export async function deleteRule(userId: string, ruleId: string) {
  const rule = await prisma.icsTitleRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.userId !== userId) throw new AppError(404, "NOT_FOUND", "Rule not found");
  await prisma.icsTitleRule.delete({ where: { id: ruleId } });
}

function validateRegex(matchType: string, pattern: string) {
  if (matchType !== "REGEX") return;
  try {
    new RegExp(pattern);
  } catch {
    throw new AppError(400, "INVALID_REGEX", "Pattern is invalid RegExp");
  }
}
