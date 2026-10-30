import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { meQueryOptions } from "@/api/hooks";
import { AddFriendByInviteCode } from "@/components/friends/AddFriendByInviteCode";
import { Friends } from "@/components/friends/Friends";
import * as pendingRoomJoin from "@/lib/pendingRoomJoin";
import { RootLayout } from "@/routes/_root";
import { Home } from "@/routes/Home";
import { Setup } from "@/routes/Setup";
import { Settings } from "@/routes/Settings";
import { SignIn } from "@/routes/SignIn";
import { SemesterOverview } from "@/routes/SemesterOverview";
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

async function redirectIfSignedIn(queryClient: QueryClient) {
  try {
    const me = await queryClient.fetchQuery(meQueryOptions);
    if (me) throw redirect({ to: "/" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    throw error;
  }
}

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
  component: SignIn,
});
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", beforeLoad: () => { throw redirect({ to: "/signin" }); } });
const verifyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/verify", component: Verify });
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/setup", beforeLoad: ({ context }) => requireAuth(context.queryClient), component: Setup });
const meRoute = createRoute({ getParentRoute: () => rootRoute, path: "/me", beforeLoad: () => { throw redirect({ to: "/settings" }); } });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Settings });
const settingsCalendarRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings/calendar", beforeLoad: () => { throw redirect({ to: "/settings" }); } });
const settingsGoogleIntegrationRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings/integrations/google", beforeLoad: () => { throw redirect({ to: "/settings" }); } });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Home });
const timetableRedirect = createRoute({ getParentRoute: () => rootRoute, path: "/timetable", beforeLoad: () => { throw redirect({ to: "/" }); } });
const templatesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/templates", beforeLoad: () => { throw redirect({ to: "/" }); } });
const statsRedirect = createRoute({ getParentRoute: () => rootRoute, path: "/stats", beforeLoad: () => { throw redirect({ to: "/semester" }); } });
const semesterRoute = createRoute({ getParentRoute: () => rootRoute, path: "/semester", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: SemesterOverview });
const roomsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/rooms", beforeLoad: () => { throw redirect({ to: "/" }); } });
const roomDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/rooms/$id", beforeLoad: () => { throw redirect({ to: "/" }); } });
const roomJoinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rooms/join/$inviteCode",
  beforeLoad: async ({ context, params }) => {
    pendingRoomJoin.set(params.inviteCode);
    await requireCompleteSetup(context.queryClient);
    throw redirect({ to: "/" });
  },
});
const friendsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/friends", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Friends });
const friendAddRoute = createRoute({ getParentRoute: () => rootRoute, path: "/friends/add/$inviteCode", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: AddFriendByInviteCode });

const routeTree = rootRoute.addChildren([
  signInRoute,
  loginRoute,
  verifyRoute,
  setupRoute,
  meRoute,
  settingsRoute,
  settingsCalendarRoute,
  settingsGoogleIntegrationRoute,
  homeRoute,
  timetableRedirect,
  templatesRoute,
  statsRedirect,
  semesterRoute,
  roomsRoute,
  roomDetailRoute,
  roomJoinRoute,
  friendsRoute,
  friendAddRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient } });
}
