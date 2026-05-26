import type { Course, DaySlot, Department, Meeting, School, Semester, TimetableTemplate, UserTimetable } from "@prisma/client";
import { toIsoDate } from "./tz";

export function schoolDto(school: School) {
  return {
    id: school.id,
    mextCode: school.mextCode,
    kind: school.kind,
    name: school.name,
    nameKana: school.nameKana,
    prefecture: school.prefecture,
  };
}

export function departmentDto(department: Department) {
  return {
    id: department.id,
    schoolId: department.schoolId,
    name: department.name,
    nameKana: department.nameKana,
  };
}

export function semesterDto(semester: Semester) {
  return {
    id: semester.id,
    name: semester.name,
    startDate: toIsoDate(semester.startDate),
    endDate: toIsoDate(semester.endDate),
  };
}

export function daySlotDto(slot: DaySlot | { periodIndex: number; label: string; startMinute: number; endMinute: number; isBreak: boolean }) {
  return {
    periodIndex: slot.periodIndex,
    label: slot.label,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    isBreak: slot.isBreak,
  };
}

export function courseDto(course: Course | { id: string; name: string; teacher: string | null; room: string | null; color: string | null; totalSessions: number; note: string | null }) {
  return {
    id: course.id,
    name: course.name,
    teacher: course.teacher,
    room: course.room,
    color: course.color,
    totalSessions: course.totalSessions,
    note: course.note,
  };
}

export function meetingDto(meeting: Meeting | { id: string; courseId: string; dayOfWeek: number; startPeriodIndex: number; periodCount: number }) {
  return {
    id: meeting.id,
    courseId: meeting.courseId,
    dayOfWeek: meeting.dayOfWeek,
    startPeriodIndex: meeting.startPeriodIndex,
    periodCount: meeting.periodCount,
  };
}

export type TemplateWithParts = TimetableTemplate & {
  daySlots: Array<{ periodIndex: number; label: string; startMinute: number; endMinute: number; isBreak: boolean }>;
  courses: Array<{ id: string; name: string; teacher: string | null; room: string | null; color: string | null; totalSessions: number; note: string | null }>;
  meetings: Array<{ id: string; courseId: string; dayOfWeek: number; startPeriodIndex: number; periodCount: number }>;
};

export function templateDto(template: TemplateWithParts) {
  return {
    id: template.id,
    authorUserId: template.authorUserId,
    schoolId: template.schoolId,
    departmentId: template.departmentId,
    title: template.title,
    description: template.description,
    year: template.year,
    term: template.term,
    isPublic: template.isPublic,
    copyCount: template.copyCount,
    daySlots: template.daySlots.map(daySlotDto),
    courses: template.courses.map(courseDto),
    meetings: template.meetings.map(meetingDto),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

export type UserTimetableWithParts = UserTimetable & {
  daySlots: DaySlot[];
  courses: Course[];
  meetings: Meeting[];
};

export function userTimetableDto(timetable: UserTimetableWithParts) {
  return {
    id: timetable.id,
    userId: timetable.userId,
    semesterId: timetable.semesterId,
    title: timetable.title,
    sourceTemplateId: timetable.sourceTemplateId,
    daySlots: timetable.daySlots.map(daySlotDto),
    courses: timetable.courses.map(courseDto),
    meetings: timetable.meetings.map(meetingDto),
    createdAt: timetable.createdAt.toISOString(),
    updatedAt: timetable.updatedAt.toISOString(),
  };
}
