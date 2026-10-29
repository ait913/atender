import { env } from "../env";

export const AIS_MAIL_SEND_PATH = "/api/v1/send";
export const AIS_MAIL_TIMEOUT_MS = 20_000;

export type MailMessage = {
  to: string; // 単一アドレス。加工しない (trim も小文字化もしない)
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string; // 指定時だけ body.idempotency_key に入れる。Magic Link では使わない
};

export type MailSendStatus = "sent" | "queued" | "sending";
export type MailSendResult = { id: string; status: MailSendStatus };

export type SendMailOptions = {
  baseUrl?: string; // 既定 env.AIS_MAIL_URL
  token?: string; // 既定 env.AIS_MAIL_TOKEN
  timeoutMs?: number; // 既定 AIS_MAIL_TIMEOUT_MS
};

/** AIS Mail の error.code (例: "unauthorized", "rate_limited") か、atender 側で付ける下の 5 つ */
export type MailSendErrorCode =
  | "http_error" // 200/202 以外で、body に有効な error.code が無い
  | "invalid_response" // 200/202 以外の 2xx、または 200/202 で body が契約どおりでない
  | "send_failed" // 200/202 で status が "failed"
  | "network_error" // fetch か body の読み込みが timeout 以外の理由で reject
  | "timeout" // timeoutMs 以内に応答 (body まで) が揃わない
  | (string & {}); // AIS Mail の error.code (/^[a-z][a-z0-9_]{0,63}$/ に合うものだけ採る)

export class MailSendError extends Error {
  readonly name = "MailSendError";
  constructor(
    readonly code: MailSendErrorCode,
    readonly status: number | null, // HTTP status。network_error / timeout は null
  ) {
    super(`AIS Mail send failed: ${code}${status === null ? "" : ` (HTTP ${status})`}`);
  }
}

const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const OK_STATUSES: readonly string[] = ["sent", "queued", "sending"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function sendMail(message: MailMessage, options: SendMailOptions = {}): Promise<MailSendResult> {
  const baseUrl = options.baseUrl ?? env.AIS_MAIL_URL;
  const token = options.token ?? env.AIS_MAIL_TOKEN;
  const timeoutMs = options.timeoutMs ?? AIS_MAIL_TIMEOUT_MS;

  const url = `${baseUrl.replace(/\/+$/, "")}${AIS_MAIL_SEND_PATH}`;
  const body: Record<string, string> = {
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
  if (message.idempotencyKey !== undefined) body.idempotency_key = message.idempotencyKey;

  let status: number;
  let parsed: unknown;
  try {
    // グローバルの fetch を呼び出し時に引く (テストの mock が効くように)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = res.status;
    const raw = await res.text();
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : undefined;
    if (name === "TimeoutError" || name === "AbortError") throw new MailSendError("timeout", null);
    throw new MailSendError("network_error", null);
  }

  if (status === 200 || status === 202) {
    if (isRecord(parsed) && typeof parsed.id === "string" && parsed.id !== "") {
      if (typeof parsed.status === "string" && OK_STATUSES.includes(parsed.status)) {
        return { id: parsed.id, status: parsed.status as MailSendStatus };
      }
      if (parsed.status === "failed") throw new MailSendError("send_failed", status);
    } else if (isRecord(parsed) && parsed.status === "failed") {
      throw new MailSendError("send_failed", status);
    }
    throw new MailSendError("invalid_response", status);
  }
  if (status >= 200 && status < 300) throw new MailSendError("invalid_response", status);

  const code = isRecord(parsed) && isRecord(parsed.error) ? parsed.error.code : undefined;
  if (typeof code === "string" && ERROR_CODE_PATTERN.test(code)) throw new MailSendError(code, status);
  throw new MailSendError("http_error", status);
}
