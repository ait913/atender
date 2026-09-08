-- CreateTable
CREATE TABLE "ClassTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userTimetableId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceDayOfWeek" INTEGER,
    "sourceDate" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClassTransfer_userTimetableId_fkey" FOREIGN KEY ("userTimetableId") REFERENCES "UserTimetable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassTransferDisplacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transferId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    CONSTRAINT "ClassTransferDisplacement_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "ClassTransfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassTransferDisplacement_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MeetingOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "periodOffset" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "transferId" TEXT,
    "periodIndex" INTEGER,
    CONSTRAINT "MeetingOccurrence_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingOccurrence_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingOccurrence_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "ClassTransfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MeetingOccurrence" ("courseId", "date", "endMinute", "id", "meetingId", "periodOffset", "startMinute") SELECT "courseId", "date", "endMinute", "id", "meetingId", "periodOffset", "startMinute" FROM "MeetingOccurrence";
DROP TABLE "MeetingOccurrence";
ALTER TABLE "new_MeetingOccurrence" RENAME TO "MeetingOccurrence";
CREATE INDEX "MeetingOccurrence_courseId_date_idx" ON "MeetingOccurrence"("courseId", "date");
CREATE INDEX "MeetingOccurrence_date_idx" ON "MeetingOccurrence"("date");
CREATE INDEX "MeetingOccurrence_transferId_idx" ON "MeetingOccurrence"("transferId");
CREATE UNIQUE INDEX "MeetingOccurrence_meetingId_date_periodOffset_key" ON "MeetingOccurrence"("meetingId", "date", "periodOffset");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ClassTransfer_userTimetableId_date_idx" ON "ClassTransfer"("userTimetableId", "date");

-- CreateIndex
CREATE INDEX "ClassTransferDisplacement_transferId_idx" ON "ClassTransferDisplacement"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTransferDisplacement_meetingId_date_key" ON "ClassTransferDisplacement"("meetingId", "date");
