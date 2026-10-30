export type SemesterCreationContext = "onboarding" | "rollover";
export type SemesterCreationStep =
  | { kind: "createSemester" }
  | { kind: "copyTemplate"; templateId: string }
  | { kind: "setDefaultSemester" }
  | { kind: "refreshMe" };

export function steps(
  context: SemesterCreationContext,
  createdSemesterId: string | null,
  templateId: string | null,
  templateCopied: boolean,
): SemesterCreationStep[] {
  const result: SemesterCreationStep[] = [];
  if (createdSemesterId == null) result.push({ kind: "createSemester" });
  if (templateId != null && !templateCopied) result.push({ kind: "copyTemplate", templateId });
  result.push({ kind: "setDefaultSemester" });
  if (context === "onboarding") result.push({ kind: "refreshMe" });
  return result;
}
