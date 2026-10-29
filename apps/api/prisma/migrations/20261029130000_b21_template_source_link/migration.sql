ALTER TABLE "TimetableTemplate" ADD COLUMN "sourceUserTimetableId" TEXT;
ALTER TABLE "TimetableTemplate" ADD COLUMN "daysOfWeek" TEXT;
CREATE UNIQUE INDEX "TimetableTemplate_sourceUserTimetableId_key" ON "TimetableTemplate"("sourceUserTimetableId");
