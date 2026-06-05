-- CreateTable
CREATE TABLE "TimetableSuspension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userTimetableId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimetableSuspension_userTimetableId_fkey" FOREIGN KEY ("userTimetableId") REFERENCES "UserTimetable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalEvent" (
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
    CONSTRAINT "PersonalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalEvent_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TimetableSuspension_userTimetableId_idx" ON "TimetableSuspension"("userTimetableId");

-- CreateIndex
CREATE INDEX "TimetableSuspension_date_idx" ON "TimetableSuspension"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSuspension_userTimetableId_date_key" ON "TimetableSuspension"("userTimetableId", "date");

-- CreateIndex
CREATE INDEX "PersonalEvent_userId_date_idx" ON "PersonalEvent"("userId", "date");

-- CreateIndex
CREATE INDEX "PersonalEvent_semesterId_idx" ON "PersonalEvent"("semesterId");
