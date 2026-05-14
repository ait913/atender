import type {
  AttendanceRuleDto,
  CourseDto,
  DaySlotDto,
  DepartmentDto,
  EffectiveRuleResponse,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeUpdateInput,
  MeetingDto,
  OccurrenceDto,
  SchoolDto,
  SchoolSearchQuery,
  SemesterCreateInput,
  SemesterDto,
  SemesterUpdateInput,
  StatsResponse,
  TemplateCopyInput,
  TemplateCreateInput,
  TemplateDto,
  UserDto,
  UserTimetableCreateInput,
  UserTimetableDto,
  UserTimetablePatchInput,
} from "@atender/shared";

export type SetupStatus = {
  hasSchool: boolean;
  hasDepartment: boolean;
  hasSemester: boolean;
  hasUserTimetable: boolean;
  isComplete: boolean;
};

export type MeResponse = { user: UserDto; setupStatus: SetupStatus };
export type SchoolsResponse = { schools: SchoolDto[] };
export type DepartmentsResponse = { departments: DepartmentDto[] };
export type SemestersResponse = { semesters: SemesterDto[] };
export type SemesterResponse = { semester: SemesterDto };
export type TemplatesResponse = { templates: TemplateDto[]; nextCursor: string | null };
export type TemplateResponse = { template: TemplateDto };
export type UserTimetablesResponse = { userTimetables: UserTimetableDto[] };
export type UserTimetableResponse = { userTimetable: UserTimetableDto };
export type MeetingResponse = { meeting: MeetingDto };
export type CourseResponse = { course: CourseDto };
export type DaySlotResponse = { daySlot: DaySlotDto };
export type DaySlotsResponse = { daySlots: DaySlotDto[] };
export type AttendanceRecordResponse = { record: { occurrenceId: string; status: OccurrenceDto["status"]; note: string | null; updatedAt: string } };
export type RuleResponse = { rule: AttendanceRuleDto };
export type OkResponse = { ok: true };

export type {
  EffectiveRuleResponse,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeUpdateInput,
  SchoolSearchQuery,
  SemesterCreateInput,
  SemesterUpdateInput,
  StatsResponse,
  TemplateCopyInput,
  TemplateCreateInput,
  UserTimetableCreateInput,
  UserTimetablePatchInput,
};
