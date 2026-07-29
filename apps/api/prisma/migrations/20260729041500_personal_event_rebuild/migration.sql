-- CreateTable
CREATE TABLE "PersonalEventOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "originalDate" DATETIME NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "newStart" DATETIME, "newEnd" DATETIME, "newTitle" TEXT,
    "newLocation" TEXT, "newNote" TEXT, "newColor" TEXT, "newIsAllDay" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalEventOverride_seriesId_fkey" FOREIGN KEY ("seriesId")
      REFERENCES "PersonalEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PersonalEventOverride_seriesId_originalDate_key" ON "PersonalEventOverride"("seriesId", "originalDate");
CREATE INDEX "PersonalEventOverride_seriesId_idx" ON "PersonalEventOverride"("seriesId");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PersonalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT, "note" TEXT, "color" TEXT,
    "recurrenceRule" TEXT, "exDates" TEXT, "rDates" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "ekExternalId" TEXT, "ekCalendarId" TEXT,
    "ekOccurrenceStart" DATETIME, "ekLastModified" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalEvent_userId_fkey" FOREIGN KEY ("userId")
      REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ★ 変換式。旧 "date" は「JST 00:00 の絶対時刻」を INTEGER(ms) で保持している (実測: typeof=integer)。
--   終日      : start = date,                      end = date + 86400000        (排他・翌日 JST 00:00)
--   時刻あり  : start = date + startMinute*60000,  end = date + endMinute*60000
--   時刻ありで startMinute/endMinute が NULL の壊れ行は終日として救済する
INSERT INTO "new_PersonalEvent"
  ("id","userId","title","start","end","isAllDay","location","note","color",
   "recurrenceRule","exDates","rDates","source","ekExternalId","ekCalendarId",
   "ekOccurrenceStart","ekLastModified","createdAt","updatedAt")
SELECT
  "id","userId","title",
  CASE WHEN "isAllDay" = 1 OR "startMinute" IS NULL THEN "date"
       ELSE "date" + "startMinute" * 60000 END,
  CASE WHEN "isAllDay" = 1 OR "startMinute" IS NULL OR "endMinute" IS NULL THEN "date" + 86400000
       WHEN "endMinute" <= "startMinute" THEN "date" + "startMinute" * 60000 + 60000
       ELSE "date" + "endMinute" * 60000 END,
  CASE WHEN "isAllDay" = 1 OR "startMinute" IS NULL THEN 1 ELSE 0 END,
  NULL, "note", "color",
  NULL, NULL, NULL,
  "source", "ekExternalId", "ekCalendarId",
  NULL, "ekLastModified",
  "createdAt","updatedAt"
FROM "PersonalEvent";

DROP TABLE "PersonalEvent";
ALTER TABLE "new_PersonalEvent" RENAME TO "PersonalEvent";
CREATE INDEX "PersonalEvent_userId_start_idx" ON "PersonalEvent"("userId", "start");
CREATE INDEX "PersonalEvent_userId_ekExternalId_idx" ON "PersonalEvent"("userId", "ekExternalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
