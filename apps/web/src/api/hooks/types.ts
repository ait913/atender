import type {
  AttendanceRuleDto,
  CourseCreateInput,
  CourseDto,
  CreateFriendshipInput,
  CreateRoomEventInput,
  CreateRoomInput,
  DepartmentDto,
  EffectiveRuleResponse,
  FriendshipDto,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeUpdateInput,
  MeetingBulkCreateInput,
  OccurrenceDto,
  RoomDto,
  RoomEventDto,
  RoomMemberDto,
  RoomSummaryDto,
  RoomWeekDto,
  SchoolDto,
  SchoolSearchQuery,
  SemesterCreateInput,
  SemesterDto,
  StatsResponse,
  TemplateCopyInput,
  TemplateCreateInput,
  TemplateDto,
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
export type FriendshipsResponse = { friendships: FriendshipDto[] };
export type FriendshipResponse = { friendship: FriendshipDto };
export type UsersSearchResponse = { users: UserSearchDto[] };
export type RoomsResponse = { rooms: RoomSummaryDto[] };
export type RoomResponse = { room: RoomDto };
export type RoomMembersResponse = { members: RoomMemberDto[] };
export type RoomEventsResponse = { events: RoomEventDto[] };
export type RoomEventResponse = { event: RoomEventDto };
export type RoomInviteResponse = { inviteCode: string; inviteExpiresAt: string };

export type {
  EffectiveRuleResponse,
  MarkAllPresentInput,
  MarkAllPresentResponse,
  MarkAttendanceInput,
  MeetingBulkCreateInput,
  MeUpdateInput,
  CourseCreateInput,
  CreateFriendshipInput,
  CreateRoomInput,
  CreateRoomEventInput,
  UpdateRoomInput,
  UpdateRoomEventInput,
  RoomWeekDto,
  SchoolSearchQuery,
  SemesterCreateInput,
  StatsResponse,
  TemplateCopyInput,
  TemplateCreateInput,
  UserTimetableCreateInput,
  UserTimetablePatchInput,
};
