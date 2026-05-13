-- CreateTable
CREATE TABLE "User" (
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
    CONSTRAINT "User_defaultSemesterId_fkey" FOREIGN KEY ("defaultSemesterId") REFERENCES "Semester" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mextCode" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "prefecture" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "School_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Department_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Department_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Semester_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimetableTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorUserId" TEXT NOT NULL,
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
    CONSTRAINT "TimetableTemplate_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateDaySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TemplateDaySlot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TimetableTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacher" TEXT,
    "room" TEXT,
    "color" TEXT,
    "totalSessions" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "TemplateCourse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TimetableTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateMeeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startPeriodIndex" INTEGER NOT NULL,
    "periodCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "TemplateMeeting_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TimetableTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateMeeting_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TemplateCourse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserTimetable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceTemplateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserTimetable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTimetable_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTimetable_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "TimetableTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DaySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userTimetableId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DaySlot_userTimetableId_fkey" FOREIGN KEY ("userTimetableId") REFERENCES "UserTimetable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userTimetableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacher" TEXT,
    "room" TEXT,
    "color" TEXT,
    "totalSessions" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "Course_userTimetableId_fkey" FOREIGN KEY ("userTimetableId") REFERENCES "UserTimetable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userTimetableId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startPeriodIndex" INTEGER NOT NULL,
    "periodCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Meeting_userTimetableId_fkey" FOREIGN KEY ("userTimetableId") REFERENCES "UserTimetable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Meeting_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "periodOffset" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    CONSTRAINT "MeetingOccurrence_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingOccurrence_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "MeetingOccurrence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT,
    "excusedStrategy" TEXT NOT NULL DEFAULT 'REDUCE_DENOMINATOR',
    "tardyStrategy" TEXT NOT NULL DEFAULT 'HALF_PRESENT',
    "earlyLeaveStrategy" TEXT NOT NULL DEFAULT 'HALF_PRESENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_schoolId_departmentId_idx" ON "User"("schoolId", "departmentId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "School_mextCode_key" ON "School"("mextCode");

-- CreateIndex
CREATE INDEX "School_name_idx" ON "School"("name");

-- CreateIndex
CREATE INDEX "School_prefecture_idx" ON "School"("prefecture");

-- CreateIndex
CREATE INDEX "Department_schoolId_idx" ON "Department"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_schoolId_name_key" ON "Department"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Semester_userId_idx" ON "Semester"("userId");

-- CreateIndex
CREATE INDEX "TimetableTemplate_schoolId_departmentId_updatedAt_idx" ON "TimetableTemplate"("schoolId", "departmentId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "TimetableTemplate_authorUserId_idx" ON "TimetableTemplate"("authorUserId");

-- CreateIndex
CREATE INDEX "TemplateDaySlot_templateId_idx" ON "TemplateDaySlot"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDaySlot_templateId_periodIndex_key" ON "TemplateDaySlot"("templateId", "periodIndex");

-- CreateIndex
CREATE INDEX "TemplateCourse_templateId_idx" ON "TemplateCourse"("templateId");

-- CreateIndex
CREATE INDEX "TemplateMeeting_templateId_dayOfWeek_idx" ON "TemplateMeeting"("templateId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "TemplateMeeting_courseId_idx" ON "TemplateMeeting"("courseId");

-- CreateIndex
CREATE INDEX "UserTimetable_userId_semesterId_idx" ON "UserTimetable"("userId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTimetable_userId_semesterId_key" ON "UserTimetable"("userId", "semesterId");

-- CreateIndex
CREATE INDEX "DaySlot_userTimetableId_idx" ON "DaySlot"("userTimetableId");

-- CreateIndex
CREATE UNIQUE INDEX "DaySlot_userTimetableId_periodIndex_key" ON "DaySlot"("userTimetableId", "periodIndex");

-- CreateIndex
CREATE INDEX "Course_userTimetableId_idx" ON "Course"("userTimetableId");

-- CreateIndex
CREATE INDEX "Meeting_userTimetableId_dayOfWeek_idx" ON "Meeting"("userTimetableId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Meeting_courseId_idx" ON "Meeting"("courseId");

-- CreateIndex
CREATE INDEX "MeetingOccurrence_courseId_date_idx" ON "MeetingOccurrence"("courseId", "date");

-- CreateIndex
CREATE INDEX "MeetingOccurrence_date_idx" ON "MeetingOccurrence"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingOccurrence_meetingId_date_periodOffset_key" ON "MeetingOccurrence"("meetingId", "date", "periodOffset");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_occurrenceId_key" ON "AttendanceRecord"("occurrenceId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_userId_createdAt_idx" ON "AttendanceRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceRule_schoolId_departmentId_idx" ON "AttendanceRule"("schoolId", "departmentId");

-- CreateIndex
CREATE INDEX "AttendanceRule_userId_idx" ON "AttendanceRule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRule_schoolId_departmentId_userId_key" ON "AttendanceRule"("schoolId", "departmentId", "userId");
