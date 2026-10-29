import type { TemplateCopyInput, UserTimetableDto } from "@atender/shared";

export type TemplateImportDecision =
  | { kind: "copy" }
  | { kind: "replaceSilently" }
  | { kind: "confirmReplace"; courseCount: number };

export function decide(existing: UserTimetableDto | null): TemplateImportDecision {
  if (existing == null) return { kind: "copy" };
  if (existing.meetings.length === 0 && existing.courses.length === 0) return { kind: "replaceSilently" };
  return { kind: "confirmReplace", courseCount: existing.courses.length };
}

export function copyInput(semesterId: string, decision: TemplateImportDecision): TemplateCopyInput {
  return decision.kind === "copy" ? { semesterId } : { semesterId, replaceExisting: true };
}
