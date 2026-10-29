export type AisMailCall = { url: string; init: RequestInit; headers: Headers; body: Record<string, unknown> };

export function aisMailOk(): Response {
  return new Response(JSON.stringify({ id: "test-mail-id", status: "sent" }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

export function aisMailResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const isString = typeof body === "string";
  return new Response(isString ? body : JSON.stringify(body), {
    status,
    headers: isString ? headers : { "Content-Type": "application/json", ...headers },
  });
}

export function aisMailCalls(): AisMailCall[] {
  return globalThis.__aisMailFetchMock.mock.calls.map(([url, init]) => ({
    url,
    init,
    headers: new Headers(init.headers),
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }));
}

export function lastAisMailCall(): AisMailCall | undefined {
  const calls = aisMailCalls();
  return calls[calls.length - 1];
}
