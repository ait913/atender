import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { meQueryOptions } from "@/api/hooks";
import { RootLayout } from "@/routes/_root";
import { Home } from "@/routes/Home";
import { Settings } from "@/routes/Settings";
import { Setup } from "@/routes/Setup";
import { SignIn } from "@/routes/SignIn";
import { Stats } from "@/routes/Stats";
import { Templates } from "@/routes/Templates";
import { Timetable } from "@/routes/Timetable";
import { Verify } from "@/routes/Verify";

type RouterContext = { queryClient: QueryClient };

const rootRoute = createRootRouteWithContext<RouterContext>()({
  loader: ({ context }) => context.queryClient.fetchQuery(meQueryOptions).catch(() => null),
  component: RootLayout,
});

async function requireAuth(queryClient: QueryClient) {
  try {
    return await queryClient.fetchQuery(meQueryOptions);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect({ to: "/signin" });
    throw error;
  }
}

async function requireCompleteSetup(queryClient: QueryClient) {
  const me = await requireAuth(queryClient);
  if (!me.setupStatus.isComplete) throw redirect({ to: "/setup" });
  return me;
}

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  component: SignIn,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: () => {
    throw redirect({ to: "/signin" });
  },
});

const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify",
  component: Verify,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: Setup,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient),
  component: Home,
});

const timetableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/timetable",
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: Timetable,
});

const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/templates",
  beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient),
  component: Templates,
});

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stats",
  beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient),
  component: Stats,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: Settings,
});

const routeTree = rootRoute.addChildren([signInRoute, loginRoute, verifyRoute, setupRoute, homeRoute, timetableRoute, templatesRoute, statsRoute, settingsRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient } });
}
