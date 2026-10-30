let pendingCode: string | null = null;

export function set(code: string): void {
  pendingCode = code;
}

export function take(): string | null {
  const code = pendingCode;
  pendingCode = null;
  return code;
}
