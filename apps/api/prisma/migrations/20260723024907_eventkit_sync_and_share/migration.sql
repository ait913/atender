-- CreateTable
CREATE TABLE "PersonalCalendarShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visibilityMode" TEXT NOT NULL DEFAULT 'TITLE_MAPPED',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastProjectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalCalendarShare_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalCalendarShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PersonalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "semesterId" TEXT,
    "date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT true,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "color" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "ekExternalId" TEXT,
    "ekCalendarId" TEXT,
    "ekLastModified" DATETIME,
    CONSTRAINT "PersonalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalEvent_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PersonalEvent" ("color", "createdAt", "date", "endMinute", "id", "isAllDay", "note", "semesterId", "startMinute", "title", "updatedAt", "userId") SELECT "color", "createdAt", "date", "endMinute", "id", "isAllDay", "note", "semesterId", "startMinute", "title", "updatedAt", "userId" FROM "PersonalEvent";
DROP TABLE "PersonalEvent";
ALTER TABLE "new_PersonalEvent" RENAME TO "PersonalEvent";
CREATE INDEX "PersonalEvent_userId_date_idx" ON "PersonalEvent"("userId", "date");
CREATE INDEX "PersonalEvent_semesterId_idx" ON "PersonalEvent"("semesterId");
CREATE INDEX "PersonalEvent_userId_ekExternalId_idx" ON "PersonalEvent"("userId", "ekExternalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PersonalCalendarShare_userId_idx" ON "PersonalCalendarShare"("userId");

-- CreateIndex
CREATE INDEX "PersonalCalendarShare_roomId_idx" ON "PersonalCalendarShare"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalCalendarShare_roomId_userId_key" ON "PersonalCalendarShare"("roomId", "userId");
