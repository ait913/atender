import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env";
import { corsMiddleware } from "./middleware/cors";
import { clientVersionGuard } from "./middleware/clientVersion";
import { registerErrorHandler } from "./middleware/error";
import { registerAttendanceRoutes } from "./routes/attendance";
import { registerAuthRoutes } from "./routes/auth";
import { registerCourseRoutes } from "./routes/courses";
import { registerDayRoutes } from "./routes/day";
import { registerFriendshipRoutes } from "./routes/friendships";
import { registerHealthRoutes } from "./routes/health";
import { registerMeRoutes } from "./routes/me";
import { registerMeetingRoutes } from "./routes/meetings";
import { registerPersonalEventRoutes } from "./routes/personalEvents";
import { registerRuleRoutes } from "./routes/rules";
import { registerRoomRoutes } from "./routes/rooms";
import { registerSchoolRoutes } from "./routes/schools";
import { registerSemesterRoutes } from "./routes/semesters";
import { registerStatsRoutes } from "./routes/stats";
import { registerTemplateRoutes } from "./routes/templates";
import { registerTodayRoutes } from "./routes/today";
import { registerTimetableSuspensionRoutes } from "./routes/timetableSuspensions";
import { registerUsersRoutes } from "./routes/users";
import { registerUserTimetableRoutes } from "./routes/userTimetables";
import { registerVersionRoutes } from "./routes/version";

export const app = new Hono();

app.use("*", corsMiddleware);
app.use("*", clientVersionGuard);
registerErrorHandler(app);

registerHealthRoutes(app);
registerVersionRoutes(app);
registerAuthRoutes(app);
registerMeRoutes(app);
registerUsersRoutes(app);
registerFriendshipRoutes(app);
registerCourseRoutes(app);
registerDayRoutes(app);
registerSchoolRoutes(app);
registerSemesterRoutes(app);
registerTemplateRoutes(app);
registerUserTimetableRoutes(app);
registerMeetingRoutes(app);
registerTodayRoutes(app);
registerTimetableSuspensionRoutes(app);
registerPersonalEventRoutes(app);
registerAttendanceRoutes(app);
registerStatsRoutes(app);
registerRuleRoutes(app);
registerRoomRoutes(app);

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" });
  console.log(`Atender API listening on :${env.PORT}`);
}
