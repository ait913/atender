export class GoogleAuthError extends Error {
  constructor(public reason: "FAILED_TO_GET_ACCESS_TOKEN" | "TOKEN_INVALID" | "INVALID_GRANT", message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export class GoogleSyncTokenInvalidError extends Error {
  constructor(message = "syncToken expired or invalid") {
    super(message);
    this.name = "GoogleSyncTokenInvalidError";
  }
}

export class GoogleApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Google API ${status}: ${body.slice(0, 500)}`);
    this.name = "GoogleApiError";
  }
}

const BASE = "https://www.googleapis.com";

export async function googleFetchJson<T = unknown>(args: {
  accessToken: string;
  url: string;
  method?: "GET" | "POST" | "DELETE";
}): Promise<T> {
  const res = await fetch(args.url, {
    method: args.method ?? "GET",
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  if (res.status === 401) {
    throw new GoogleAuthError("TOKEN_INVALID", "Token rejected after refresh");
  }
  if (res.status === 410) {
    throw new GoogleSyncTokenInvalidError();
  }
  if (!res.ok) {
    throw new GoogleApiError(res.status, await res.text().catch(() => ""));
  }
  return res.json() as Promise<T>;
}

export function buildUrl(path: string, query: Record<string, string | number | undefined>): string {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}
