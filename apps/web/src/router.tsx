import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { meQueryOptions } from "@/api/hooks";
import { AddFriendByInviteCode } from "@/components/friends/AddFriendByInviteCode";
import { Friends } from "@/components/friends/Friends";
import { JoinRoom } from "@/components/rooms/JoinRoom";
import { RoomDetail } from "@/components/rooms/RoomDetail";
import { Rooms } from "@/components/rooms/Rooms";
import { RootLayout } from "@/routes/_root";
import { Setup } from "@/routes/Setup";
import { SettingsCalendar } from "@/routes/SettingsCalendar";
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
const meRoute = createRoute({ getParentRoute: () => rootRoute, path: "/me", beforeLoad: () => { throw redirect({ to: "/" }); } });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", beforeLoad: () => { throw redirect({ to: "/" }); } });
const settingsCalendarRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings/calendar", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: SettingsCalendar });
const settingsGoogleIntegrationRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings/integrations/google", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: SettingsCalendar });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Today });
const timetableRoute = createRoute({ getParentRoute: () => rootRoute, path: "/timetable", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Timetable });
const templatesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/templates", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Templates });
const statsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/stats", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Stats });
const roomsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/rooms", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: Rooms });
const roomDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/rooms/$id", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: RoomDetail });
const roomJoinRoute = createRoute({ getParentRoute: () => rootRoute, path: "/rooms/join/$inviteCode", beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient), component: JoinRoom });
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
  timetableRoute,
  templatesRoute,
  statsRoute,
  roomsRoute,
  roomDetailRoute,
  roomJoinRoute,
  friendsRoute,
  friendAddRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient } });
}
