-- v8: Google Calendar OAuth incremental sync

CREATE TABLE "GoogleCalendarConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoogleCalendarConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "GoogleCalendarSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "calendarSummary" TEXT NOT NULL,
    "calendarTimeZone" TEXT NOT NULL,
    "visibilityMode" TEXT NOT NULL DEFAULT 'TITLE_MAPPED',
    "syncToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "lastError" TEXT,
    "lastSyncedAt" DATETIME,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleCalendarSync_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleCalendarConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoogleCalendarSync_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoomEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rawTitle" TEXT,
    "recurrenceRule" TEXT,
    "exDates" TEXT,
    "rDates" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalUid" TEXT,
    "externalSeq" INTEGER,
    "externalLastModified" DATETIME,
    "importId" TEXT,
    "visibilityMode" TEXT NOT NULL DEFAULT 'NORMAL',
    "googleSyncId" TEXT,
    "googleEventId" TEXT,
    "googleRecurringEventId" TEXT,
    CONSTRAINT "RoomEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_importId_fkey" FOREIGN KEY ("importId") REFERENCES "IcsImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_googleSyncId_fkey" FOREIGN KEY ("googleSyncId") REFERENCES "GoogleCalendarSync" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoomEvent" ("authorId", "color", "createdAt", "description", "end", "exDates", "externalLastModified", "externalSeq", "externalUid", "id", "importId", "isAllDay", "rDates", "rawTitle", "recurrenceRule", "roomId", "source", "start", "title", "updatedAt", "visibilityMode") SELECT "authorId", "color", "createdAt", "description", "end", "exDates", "externalLastModified", "externalSeq", "externalUid", "id", "importId", "isAllDay", "rDates", "rawTitle", "recurrenceRule", "roomId", "source", "start", "title", "updatedAt", "visibilityMode" FROM "RoomEvent";
DROP TABLE "RoomEvent";
ALTER TABLE "new_RoomEvent" RENAME TO "RoomEvent";
CREATE INDEX "RoomEvent_roomId_start_idx" ON "RoomEvent"("roomId", "start");
CREATE INDEX "RoomEvent_authorId_idx" ON "RoomEvent"("authorId");
CREATE UNIQUE INDEX "RoomEvent_roomId_externalUid_key" ON "RoomEvent"("roomId", "externalUid");
CREATE UNIQUE INDEX "RoomEvent_googleSyncId_googleEventId_key" ON "RoomEvent"("googleSyncId", "googleEventId");
CREATE INDEX "RoomEvent_googleSyncId_idx" ON "RoomEvent"("googleSyncId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_key" ON "GoogleCalendarConnection"("userId");
CREATE UNIQUE INDEX "GoogleCalendarConnection_accountId_key" ON "GoogleCalendarConnection"("accountId");
CREATE INDEX "GoogleCalendarConnection_status_idx" ON "GoogleCalendarConnection"("status");

CREATE UNIQUE INDEX "GoogleCalendarSync_roomId_connectionId_googleCalendarId_key" ON "GoogleCalendarSync"("roomId", "connectionId", "googleCalendarId");
CREATE INDEX "GoogleCalendarSync_connectionId_enabled_idx" ON "GoogleCalendarSync"("connectionId", "enabled");
CREATE INDEX "GoogleCalendarSync_roomId_idx" ON "GoogleCalendarSync"("roomId");
CREATE INDEX "GoogleCalendarSync_status_lastSyncedAt_idx" ON "GoogleCalendarSync"("status", "lastSyncedAt");
