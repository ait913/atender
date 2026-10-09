-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimetableTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorUserId" TEXT,
    "schoolId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "year" INTEGER,
    "term" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "copyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimetableTemplate_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimetableTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimetableTemplate" ("authorUserId", "copyCount", "createdAt", "departmentId", "description", "id", "isPublic", "schoolId", "term", "title", "updatedAt", "year") SELECT "authorUserId", "copyCount", "createdAt", "departmentId", "description", "id", "isPublic", "schoolId", "term", "title", "updatedAt", "year" FROM "TimetableTemplate";
DROP TABLE "TimetableTemplate";
ALTER TABLE "new_TimetableTemplate" RENAME TO "TimetableTemplate";
CREATE INDEX "TimetableTemplate_schoolId_departmentId_updatedAt_idx" ON "TimetableTemplate"("schoolId", "departmentId", "updatedAt" DESC);
CREATE INDEX "TimetableTemplate_authorUserId_idx" ON "TimetableTemplate"("authorUserId");
CREATE TABLE "new_RoomEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT,
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
    CONSTRAINT "RoomEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_importId_fkey" FOREIGN KEY ("importId") REFERENCES "IcsImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_googleSyncId_fkey" FOREIGN KEY ("googleSyncId") REFERENCES "GoogleCalendarSync" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoomEvent" ("authorId", "color", "createdAt", "description", "end", "exDates", "externalLastModified", "externalSeq", "externalUid", "googleEventId", "googleRecurringEventId", "googleSyncId", "id", "importId", "isAllDay", "rDates", "rawTitle", "recurrenceRule", "roomId", "source", "start", "title", "updatedAt", "visibilityMode") SELECT "authorId", "color", "createdAt", "description", "end", "exDates", "externalLastModified", "externalSeq", "externalUid", "googleEventId", "googleRecurringEventId", "googleSyncId", "id", "importId", "isAllDay", "rDates", "rawTitle", "recurrenceRule", "roomId", "source", "start", "title", "updatedAt", "visibilityMode" FROM "RoomEvent";
DROP TABLE "RoomEvent";
ALTER TABLE "new_RoomEvent" RENAME TO "RoomEvent";
CREATE INDEX "RoomEvent_roomId_start_idx" ON "RoomEvent"("roomId", "start");
CREATE INDEX "RoomEvent_authorId_idx" ON "RoomEvent"("authorId");
CREATE INDEX "RoomEvent_googleSyncId_idx" ON "RoomEvent"("googleSyncId");
CREATE UNIQUE INDEX "RoomEvent_roomId_externalUid_key" ON "RoomEvent"("roomId", "externalUid");
CREATE UNIQUE INDEX "RoomEvent_googleSyncId_googleEventId_key" ON "RoomEvent"("googleSyncId", "googleEventId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
