import { z } from "zod";

export const IcsImportDto = z.object({
  id: z.string(),
  filename: z.string().nullable(),
  source: z.enum(["ICS_FILE", "ICS_URL", "GOOGLE_OAUTH"]),
  status: z.enum(["PENDING", "PARSED", "SUCCESS", "PARTIAL_ERROR", "FAILED"]),
  parsedEventCount: z.number().int(),
  committedEventCount: z.number().int(),
  skippedEventCount: z.number().int(),
  errorMessage: z.string().nullable(),
  committedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const IcsImportPreviewItem = z.object({
  uid: z.string(),
  rawTitle: z.string(),
  mappedTitle: z.string(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]),
  ruleId: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  isRecurring: z.boolean(),
  rrule: z.string().nullable(),
});

export const IcsImportPreview = z.object({
  importId: z.string(),
  events: z.array(IcsImportPreviewItem),
});

export const IcsImportCommitResult = z.object({
  committed: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.string()),
});

export const IcsTitleRuleDto = z.object({
  id: z.string(),
  matchType: z.enum(["EQUALS", "CONTAINS", "REGEX"]),
  pattern: z.string(),
  replaceWith: z.string().nullable(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]),
  priority: z.number().int(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IcsImportDto = z.infer<typeof IcsImportDto>;
export type IcsImportPreview = z.infer<typeof IcsImportPreview>;
export type IcsImportCommitResult = z.infer<typeof IcsImportCommitResult>;
export type IcsTitleRuleDto = z.infer<typeof IcsTitleRuleDto>;
