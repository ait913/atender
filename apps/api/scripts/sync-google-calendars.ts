#!/usr/bin/env tsx
import "../src/env";
import { runAllSyncsGlobal } from "../src/services/googleCalendarSync.service";

async function main() {
  const startedAt = Date.now();
  console.log(`[cron] sync-google-calendars start at ${new Date().toISOString()}`);
  try {
    const result = await runAllSyncsGlobal();
    console.log(`[cron] sync-google-calendars done: users=${result.userCount}, syncs=${result.totalSyncs}, durationMs=${Date.now() - startedAt}`);
    process.exit(0);
  } catch (error) {
    console.error("[cron] sync-google-calendars FAILED:", error);
    process.exit(1);
  }
}

void main();
