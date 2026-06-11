/*
  Warnings:

  - You are about to drop the column `totalSessions` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `totalSessions` on the `TemplateCourse` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userTimetableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacher" TEXT,
    "color" TEXT,
    "note" TEXT,
    CONSTRAINT "Course_userTimetableId_fkey" FOREIGN KEY ("userTimetableId") REFERENCES "UserTimetable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("color", "id", "name", "note", "teacher", "userTimetableId") SELECT "color", "id", "name", "note", "teacher", "userTimetableId" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE INDEX "Course_userTimetableId_idx" ON "Course"("userTimetableId");
CREATE TABLE "new_TemplateCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacher" TEXT,
    "color" TEXT,
    "note" TEXT,
    CONSTRAINT "TemplateCourse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TimetableTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TemplateCourse" ("color", "id", "name", "note", "teacher", "templateId") SELECT "color", "id", "name", "note", "teacher", "templateId" FROM "TemplateCourse";
DROP TABLE "TemplateCourse";
ALTER TABLE "new_TemplateCourse" RENAME TO "TemplateCourse";
CREATE INDEX "TemplateCourse_templateId_idx" ON "TemplateCourse"("templateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
