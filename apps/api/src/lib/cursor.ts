import { AppError } from "./appError";

export type TemplateCursor = {
  updatedAt: string;
  id: string;
};

export function encodeCursor(cursor: TemplateCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): TemplateCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<TemplateCursor>;
    if (!parsed.updatedAt || !parsed.id) {
      throw new Error("Invalid cursor");
    }
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor");
  }
}
