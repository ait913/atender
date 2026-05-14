import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { meQueryOptions } from "@/api/hooks";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { RootLayout } from "@/routes/_root";
import { Me } from "@/routes/Me";
import { Setup } from "@/routes/Setup";
import { SignIn } from "@/routes/SignIn";
import { Stats } from "@/routes/Stats";
import { Templates } from "@/routes/Templates";
import { Timetable } from "@/routes/Timetable";
import { Today } from "@/routes/Today";
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

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth",
  component: AuthLayout,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient),
  component: AppLayout,
});

const signInRoute = createRoute({ getParentRoute: () => authRoute, path: "/signin", component: SignIn });
const verifyRoute = createRoute({ getParentRoute: () => authRoute, path: "/verify", component: Verify });
const setupRoute = createRoute({ getParentRoute: () => authRoute, path: "/setup", beforeLoad: ({ context }) => requireAuth(context.queryClient), component: Setup });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", beforeLoad: () => { throw redirect({ to: "/signin" }); } });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", beforeLoad: () => { throw redirect({ to: "/me" }); } });

const todayRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: Today });
const timetableRoute = createRoute({ getParentRoute: () => appRoute, path: "/timetable", component: Timetable });
const templatesRoute = createRoute({ getParentRoute: () => appRoute, path: "/templates", component: Templates });
const statsRoute = createRoute({ getParentRoute: () => appRoute, path: "/stats", component: Stats });
const meRoute = createRoute({ getParentRoute: () => appRoute, path: "/me", component: Me });

const routeTree = rootRoute.addChildren([
  authRoute.addChildren([signInRoute, verifyRoute, setupRoute]),
  appRoute.addChildren([todayRoute, timetableRoute, templatesRoute, statsRoute, meRoute]),
  loginRoute,
  settingsRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient } });
}
