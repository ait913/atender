/*
  Warnings:

  - Made the column `inviteCode` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "RoomEventOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "originalDate" DATETIME NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "newStart" DATETIME,
    "newEnd" DATETIME,
    "newTitle" TEXT,
    "newDescription" TEXT,
    "newColor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoomEventOverride_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "RoomEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IcsImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "filename" TEXT,
    "url" TEXT,
    "contentHash" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "parsedEventCount" INTEGER NOT NULL DEFAULT 0,
    "committedEventCount" INTEGER NOT NULL DEFAULT 0,
    "skippedEventCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "committedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IcsImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IcsImport_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IcsTitleRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "replaceWith" TEXT,
    "visibilityMode" TEXT NOT NULL DEFAULT 'TITLE_MAPPED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IcsTitleRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
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
    CONSTRAINT "RoomEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomEvent_importId_fkey" FOREIGN KEY ("importId") REFERENCES "IcsImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoomEvent" ("authorId", "color", "createdAt", "description", "end", "id", "isAllDay", "roomId", "start", "title", "updatedAt") SELECT "authorId", "color", "createdAt", "description", "end", "id", "isAllDay", "roomId", "start", "title", "updatedAt" FROM "RoomEvent";
DROP TABLE "RoomEvent";
ALTER TABLE "new_RoomEvent" RENAME TO "RoomEvent";
CREATE INDEX "RoomEvent_roomId_start_idx" ON "RoomEvent"("roomId", "start");
CREATE INDEX "RoomEvent_authorId_idx" ON "RoomEvent"("authorId");
CREATE UNIQUE INDEX "RoomEvent_roomId_externalUid_key" ON "RoomEvent"("roomId", "externalUid");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "defaultSemesterId" TEXT,
    "schoolId" TEXT,
    "departmentId" TEXT,
    "handle" TEXT,
    "inviteCode" TEXT NOT NULL,
    CONSTRAINT "User_defaultSemesterId_fkey" FOREIGN KEY ("defaultSemesterId") REFERENCES "Semester" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "defaultSemesterId", "departmentId", "email", "emailVerified", "handle", "id", "image", "inviteCode", "name", "schoolId", "updatedAt") SELECT "createdAt", "defaultSemesterId", "departmentId", "email", "emailVerified", "handle", "id", "image", "inviteCode", "name", "schoolId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");
CREATE INDEX "User_schoolId_departmentId_idx" ON "User"("schoolId", "departmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RoomEventOverride_seriesId_idx" ON "RoomEventOverride"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomEventOverride_seriesId_originalDate_key" ON "RoomEventOverride"("seriesId", "originalDate");

-- CreateIndex
CREATE INDEX "IcsImport_userId_idx" ON "IcsImport"("userId");

-- CreateIndex
CREATE INDEX "IcsImport_roomId_idx" ON "IcsImport"("roomId");

-- CreateIndex
CREATE INDEX "IcsTitleRule_userId_priority_idx" ON "IcsTitleRule"("userId", "priority");
