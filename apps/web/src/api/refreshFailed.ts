import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** 書き込みは成功したが、その後の再取得に失敗したことを表す (mutation 自体の失敗と区別する) */
export class RefreshFailedError extends Error {
  constructor() {
    super("refresh failed");
    this.name = "RefreshFailedError";
  }
}

/** 再取得の完了まで待ち、失敗したら RefreshFailedError で reject する */
export async function refreshOrThrow(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  try {
    await queryClient.invalidateQueries({ queryKey }, { throwOnError: true });
  } catch {
    throw new RefreshFailedError();
  }
}
