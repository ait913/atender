import type {
  AttendanceRuleDto,
  BulkClearAttendanceInput,
  BulkClearAttendanceResponse,
  BulkMarkAttendanceInput,
  BulkMarkAttendanceResponse,
  BulkTimetableSuspensionInput,
  BulkTimetableSuspensionRemoveInput,
  BulkTimetableSuspensionRemoveResponse,
  BulkTimetableSuspensionResponse,
  CourseCreateInput,
  CourseDto,
  CourseSuspensionCreateInput,
  CourseSuspensionDto,
  CourseUpdateInput,
  CreateFriendshipInput,
  CreateRoomEventInput,
  CreateRoomInput,
  DayDetailDto,
  DepartmentDto,
  EffectiveRuleResponse,
  FriendshipDto,
  IcsImportCommitResult,
  IcsImportDto,
  IcsImportPreview,
  IcsTitleRuleDto,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeUpdateInput,
  MeetingBulkCreateInput,
  MeetingDto,
  MeetingUpdateInput,
  OccurrenceDto,
  PersonalEventCreateInput,
  PersonalEventDeleteQuery,
  PersonalEventOccurrenceDto,
  PersonalEventSeriesDto,
  PersonalEventUpdateInput,
  RecurrenceSpec,
  RoomDto,
  RoomEventDto,
  RoomMemberDto,
  RoomSummaryDto,
  RoomWeekDto,
  SchoolDto,
  SchoolSearchQuery,
  SemesterCreateInput,
  SemesterDto,
  SemesterUpdateInput,
  SemesterOverviewDto,
  StatsResponse,
  TemplateCopyInput,
  TemplateCreateInput,
  TemplateDto,
  TimetableSuspensionCreateInput,
  TimetableSuspensionDto,
  UpdateRoomEventInput,
  UpdateRoomInput,
  UserDto,
  UserSearchDto,
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
export type CourseResponse = { course: CourseDto };
export type MeetingResponse = { meeting: MeetingDto };
export type CourseSuspensionsResponse = { suspensions: CourseSuspensionDto[] };
export type CourseSuspensionResponse = { suspension: CourseSuspensionDto };
export type TimetableSuspensionsResponse = { suspensions: TimetableSuspensionDto[] };
export type TimetableSuspensionResponse = { suspension: TimetableSuspensionDto };
export type PersonalEventsResponse = { events: PersonalEventOccurrenceDto[] };
export type PersonalEventResponse = { event: PersonalEventSeriesDto };
export type DayDetailResponse = DayDetailDto;
export type FriendshipsResponse = { friendships: FriendshipDto[] };
export type FriendshipResponse = { friendship: FriendshipDto };
export type UsersSearchResponse = { users: UserSearchDto[] };
export type RoomsResponse = { rooms: RoomSummaryDto[] };
export type RoomResponse = { room: RoomDto };
export type RoomMembersResponse = { members: RoomMemberDto[] };
export type RoomEventsResponse = { events: RoomEventDto[] };
export type RoomEventResponse = { event: RoomEventDto };
export type RoomInviteResponse = { inviteCode: string; inviteExpiresAt: string };
export type IcsImportsResponse = { imports: IcsImportDto[] };
export type IcsTitleRulesResponse = { rules: IcsTitleRuleDto[] };
export type IcsTitleRuleResponse = { rule: IcsTitleRuleDto };

export type {
  BulkClearAttendanceInput,
  BulkClearAttendanceResponse,
  BulkMarkAttendanceInput,
  BulkMarkAttendanceResponse,
  BulkTimetableSuspensionInput,
  BulkTimetableSuspensionRemoveInput,
  BulkTimetableSuspensionRemoveResponse,
  BulkTimetableSuspensionResponse,
  EffectiveRuleResponse,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeetingBulkCreateInput,
  MeetingUpdateInput,
  MeUpdateInput,
  CourseCreateInput,
  CourseUpdateInput,
  CourseSuspensionCreateInput,
  CourseSuspensionDto,
  DayDetailDto,
  CreateFriendshipInput,
  CreateRoomInput,
  CreateRoomEventInput,
  IcsImportCommitResult,
  IcsImportPreview,
  IcsTitleRuleDto,
  PersonalEventCreateInput,
  PersonalEventDeleteQuery,
  PersonalEventOccurrenceDto,
  PersonalEventSeriesDto,
  PersonalEventUpdateInput,
  RecurrenceSpec,
  UpdateRoomInput,
  UpdateRoomEventInput,
  RoomWeekDto,
  SchoolSearchQuery,
  SemesterCreateInput,
  SemesterDto,
  SemesterUpdateInput,
  SemesterOverviewDto,
  StatsResponse,
  TemplateCopyInput,
  TemplateCreateInput,
  TimetableSuspensionCreateInput,
  TimetableSuspensionDto,
  UserTimetableCreateInput,
  UserTimetablePatchInput,
};
