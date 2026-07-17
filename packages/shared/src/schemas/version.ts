import { z } from "zod";

export const VersionResponse = z.object({
  /** デプロイされている API の commit SHA。Coolify の SOURCE_COMMIT。取得不能なら "unknown" */
  commit: z.string(),
  /** API が受け入れる最小 iOS CFBundleVersion */
  minIOSBuild: z.number().int().positive(),
});

export type VersionResponse = z.infer<typeof VersionResponse>;
