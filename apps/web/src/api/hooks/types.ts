import type {
  AttendanceRuleDto,
  DepartmentDto,
  EffectiveRuleResponse,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeUpdateInput,
  OccurrenceDto,
  SchoolDto,
  SchoolSearchQuery,
  SemesterCreateInput,
  SemesterDto,
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
export type AttendanceRecordResponse = { record: { occurrenceId: string; status: OccurrenceDto["status"]; note: string | null; updatedAt: string } };
export type RuleResponse = { rule: AttendanceRuleDto };

export type {
  EffectiveRuleResponse,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeUpdateInput,
  SchoolSearchQuery,
  SemesterCreateInput,
  StatsResponse,
  TemplateCopyInput,
  TemplateCreateInput,
  UserTimetableCreateInput,
  UserTimetablePatchInput,
};
