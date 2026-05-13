import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env";
import { corsMiddleware } from "./middleware/cors";
import { registerErrorHandler } from "./middleware/error";
import { registerAttendanceRoutes } from "./routes/attendance";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoutes } from "./routes/health";
import { registerMeRoutes } from "./routes/me";
import { registerRuleRoutes } from "./routes/rules";
import { registerSchoolRoutes } from "./routes/schools";
import { registerSemesterRoutes } from "./routes/semesters";
import { registerStatsRoutes } from "./routes/stats";
import { registerTemplateRoutes } from "./routes/templates";
import { registerTodayRoutes } from "./routes/today";
import { registerUserTimetableRoutes } from "./routes/userTimetables";

export const app = new Hono();

app.use("*", corsMiddleware);
registerErrorHandler(app);

registerHealthRoutes(app);
registerAuthRoutes(app);
registerMeRoutes(app);
registerSchoolRoutes(app);
registerSemesterRoutes(app);
registerTemplateRoutes(app);
registerUserTimetableRoutes(app);
registerTodayRoutes(app);
registerAttendanceRoutes(app);
registerStatsRoutes(app);
registerRuleRoutes(app);

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" });
  console.log(`Atender API listening on :${env.PORT}`);
}
