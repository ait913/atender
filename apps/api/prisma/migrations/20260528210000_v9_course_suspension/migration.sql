-- v9: Course Suspension (一括休講日)

CREATE TABLE "CourseSuspension" (
  "id"        TEXT     NOT NULL PRIMARY KEY,
  "courseId"  TEXT     NOT NULL,
  "date"      DATETIME NOT NULL,
  "reason"    TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CourseSuspension_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourseSuspension_courseId_date_key" ON "CourseSuspension"("courseId", "date");
CREATE INDEX        "CourseSuspension_courseId_idx"      ON "CourseSuspension"("courseId");
CREATE INDEX        "CourseSuspension_date_idx"          ON "CourseSuspension"("date");
