-- 1. Meeting / TemplateMeeting に room カラム追加
ALTER TABLE "Meeting" ADD COLUMN "room" TEXT;
ALTER TABLE "TemplateMeeting" ADD COLUMN "room" TEXT;

-- 2. データ移行: Course.room / TemplateCourse.room を各 Meeting へコピー
UPDATE "Meeting"
SET "room" = (SELECT "Course"."room" FROM "Course" WHERE "Course"."id" = "Meeting"."courseId")
WHERE "room" IS NULL;

UPDATE "TemplateMeeting"
SET "room" = (SELECT "TemplateCourse"."room" FROM "TemplateCourse" WHERE "TemplateCourse"."id" = "TemplateMeeting"."courseId")
WHERE "room" IS NULL;

-- 3. Course / TemplateCourse から room を DROP (SQLite table rebuild)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Course" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userTimetableId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "teacher" TEXT,
  "color" TEXT,
  "totalSessions" INTEGER NOT NULL,
  "note" TEXT,
  CONSTRAINT "Course_userTimetableId_fkey" FOREIGN KEY ("userTimetableId") REFERENCES "UserTimetable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("id", "userTimetableId", "name", "teacher", "color", "totalSessions", "note")
SELECT "id", "userTimetableId", "name", "teacher", "color", "totalSessions", "note" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE INDEX "Course_userTimetableId_idx" ON "Course"("userTimetableId");

CREATE TABLE "new_TemplateCourse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "teacher" TEXT,
  "color" TEXT,
  "totalSessions" INTEGER NOT NULL,
  "note" TEXT,
  CONSTRAINT "TemplateCourse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TimetableTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TemplateCourse" ("id", "templateId", "name", "teacher", "color", "totalSessions", "note")
SELECT "id", "templateId", "name", "teacher", "color", "totalSessions", "note" FROM "TemplateCourse";
DROP TABLE "TemplateCourse";
ALTER TABLE "new_TemplateCourse" RENAME TO "TemplateCourse";
CREATE INDEX "TemplateCourse_templateId_idx" ON "TemplateCourse"("templateId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
