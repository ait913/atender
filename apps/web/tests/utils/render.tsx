import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createAppRouter } from "@/router";

type RenderAppOptions = {
  initialPath: string;
};

export async function renderApp({ initialPath }: RenderAppOptions) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createAppRouter(queryClient);
  // Replace router history with a memory-history starting from initialPath
  // so jsdom does not need to track real browser navigation.
  (router as unknown as { history: ReturnType<typeof createMemoryHistory> }).history =
    createMemoryHistory({ initialEntries: [initialPath] });

  // Best-effort: kick a navigate so internal location state reflects initialPath.
  try {
    await (router as unknown as { navigate: (o: { to: string }) => Promise<void> }).navigate({ to: initialPath });
  } catch {
    // Some routes may redirect on load (guards). Ignore and rely on RouterProvider.
  }

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
    router,
    user: userEvent.setup(),
    path: () => router.state.location.pathname,
  };
}

export function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
