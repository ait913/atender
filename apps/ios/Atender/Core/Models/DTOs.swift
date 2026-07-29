import Foundation

struct ErrorResponse: Codable, Equatable {
    let error: Body

    struct Body: Codable, Equatable {
        let code: String
        let message: String
    }
}

struct UserDto: Codable, Equatable, Identifiable {
    let id: String
    let email: String
    let name: String?
    let image: String?
    let handle: String?
    let inviteCode: String?
    let defaultSemesterId: String?
    let schoolId: String?
    let departmentId: String?
    let requiredAttendanceRate: Int
}

struct MeResponse: Codable, Equatable {
    let user: UserDto
    let setupStatus: SetupStatus
}

struct SetupStatus: Codable, Equatable {
    let hasSchool: Bool
    let hasDepartment: Bool
    let hasSemester: Bool
    let hasUserTimetable: Bool
    let isComplete: Bool
}

struct MeUpdateInput: Codable, Equatable {
    var schoolId: String?
    var departmentId: String?
    var defaultSemesterId: String?
    var name: String?
    var handle: String?
    var requiredAttendanceRate: Int?
}

struct SemesterDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let startDate: String
    let endDate: String
}

struct AttendanceDayCounts: Codable, Equatable {
    let present: Int
    let absent: Int
    let excused: Int
    let tardy: Int
    let earlyLeave: Int
    let suspended: Int
    let unrecorded: Int
}

struct AttendanceDaySummary: Codable, Equatable, Identifiable {
    var id: String { date }
    let date: String
    let status: AttendanceDayStatus   // legacy 互換 (.designs/20260729-semester-calendar-multi-status.md §3.1)
    let occurrenceCount: Int
    let counts: AttendanceDayCounts?  // nil = counts を返さない旧 API
}

struct SemesterOverviewDto: Codable, Equatable {
    let semesterId: String
    let semesterName: String
    let startDate: String
    let endDate: String
    let today: String
    let requiredAttendanceRate: Int
    let overall: Overall
    let days: [AttendanceDaySummary]
    let courses: [CourseStatsDto]

    struct Overall: Codable, Equatable {
        let effectiveNumerator: Double
        let effectiveDenominator: Double
        let attendanceRate: Double?
        let toDate: ToDate
        let unrecordedCount: Int
        let remainingCount: Int
        let allowedAbsences: Int?
    }

    struct ToDate: Codable, Equatable {
        let effectiveNumerator: Double
        let effectiveDenominator: Double
        let attendanceRate: Double?
    }
}

struct SemesterCreateInput: Codable, Equatable {
    let name: String
    let startDate: String
    let endDate: String
}

struct SemesterUpdateInput: Codable, Equatable {
    var name: String?
    var startDate: String?
    var endDate: String?
}

struct CourseStatsDto: Codable, Equatable, Identifiable {
    var id: String { courseId }
    let courseId: String
    let courseName: String
    let teacher: String?
    let generatedOccurrences: Int
    let counts: Counts
    let effectiveNumerator: Double
    let effectiveDenominator: Double
    let attendanceRate: Double?
    let separateCounts: [String: Int]?
    let toDate: ToDate
    let remainingCount: Int
    let allowedAbsences: Int?
    let maxDayPeriods: Int
    let allowedAbsenceDays: Int?

    struct Counts: Codable, Equatable {
        let present: Int
        let absent: Int
        let excused: Int
        let tardy: Int
        let earlyLeave: Int
        let cancelled: Int
        let suspended: Int
        let unrecorded: Int
    }

    struct ToDate: Codable, Equatable {
        let effectiveNumerator: Double
        let effectiveDenominator: Double
        let attendanceRate: Double?
    }
}

struct StatsResponse: Codable, Equatable {
    let semesterId: String
    let requiredAttendanceRate: Int
    let courses: [CourseStatsDto]
}

struct OccurrenceDto: Codable, Equatable, Identifiable {
    let id: String
    let meetingId: String
    let courseId: String
    let courseName: String
    let teacher: String?
    let room: String?
    let color: String?
    let date: String
    let periodIndex: Int
    let periodOffset: Int
    let startMinute: Int
    let endMinute: Int
    var status: AttendanceStatus?
}

struct TodayResponse: Codable, Equatable {
    let date: String
    var occurrences: [OccurrenceDto]
}

struct MarkAttendanceInput: Codable, Equatable {
    let status: AttendanceStatus
    var note: String?
}

struct MarkAllPresentInput: Codable, Equatable {
    var date: String?
    var status: AttendanceStatus?
}

struct MarkAllPresentResponse: Codable, Equatable {
    let date: String
    let markedCount: Int
    let skippedCount: Int
}

struct AttendanceRecordResponse: Codable, Equatable {
    let record: Record

    struct Record: Codable, Equatable {
        let occurrenceId: String
        let status: AttendanceStatus?
        let note: String?
        let updatedAt: String
    }
}

struct BulkMarkAttendanceInput: Codable, Equatable {
    let dates: [String]
    let status: AttendanceStatus
    let mode: BulkMode
}

struct BulkMarkAttendanceResponse: Codable, Equatable {
    let upsertedCount: Int
    let skippedExistingCount: Int
    let skippedSuspendedCount: Int
    let noOccurrenceDates: [String]
}

struct BulkClearAttendanceInput: Codable, Equatable {
    let dates: [String]
}

struct BulkClearAttendanceResponse: Codable, Equatable {
    let deletedCount: Int
}

struct DaySlotDto: Codable, Equatable, Identifiable {
    var id: Int { periodIndex }
    let periodIndex: Int
    let label: String
    let startMinute: Int
    let endMinute: Int
    let isBreak: Bool
}

struct CourseDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let teacher: String?
    let color: String?
    let note: String?
}

struct MeetingDto: Codable, Equatable, Identifiable {
    let id: String
    let courseId: String
    let dayOfWeek: Int
    let startPeriodIndex: Int
    let periodCount: Int
    let room: String?
}

struct TemplateDto: Codable, Equatable, Identifiable {
    let id: String
    let authorUserId: String
    let schoolId: String
    let departmentId: String
    let title: String
    let description: String?
    let year: Int?
    let term: String?
    let isPublic: Bool
    let copyCount: Int
    let daySlots: [DaySlotDto]
    let courses: [CourseDto]
    let meetings: [MeetingDto]
    let createdAt: String
    let updatedAt: String
    let schoolName: String
    let departmentName: String
}

struct TemplateSearchQuery: Equatable {
    var schoolId: String?
    var departmentId: String?
    var q: String?
    var limit: Int = 20
    var cursor: String?
}

struct TemplateCreateInput: Codable, Equatable {
    let schoolId: String
    let departmentId: String
    let title: String
    var description: String?
    var year: Int?
    var term: String?
    var isPublic: Bool = true
    var daySlots: [DaySlotCreateInput]
    var courses: [CourseTemplateInput]
    var meetings: [MeetingTemplateInput]

    struct DaySlotCreateInput: Codable, Equatable {
        let periodIndex: Int
        let label: String
        let startMinute: Int
        let endMinute: Int
        var isBreak: Bool = false
    }

    struct CourseTemplateInput: Codable, Equatable {
        let tempId: String
        let name: String
        var teacher: String?
        var color: String?
        var note: String?
    }

    struct MeetingTemplateInput: Codable, Equatable {
        let courseTempId: String
        let dayOfWeek: Int
        let startPeriodIndex: Int
        var periodCount: Int = 1
        var room: String?
    }
}

struct TemplatePublishInput: Codable, Equatable {
    let title: String
    var description: String?
    var year: Int?
    var term: String?
}

struct TemplateCopyInput: Codable, Equatable {
    let semesterId: String
    var title: String?
}

struct CourseCreateInput: Codable, Equatable {
    let userTimetableId: String
    let name: String
    var teacher: String?
    var color: String?
    var note: String?
}

struct CourseUpdateInput: Codable, Equatable {
    var name: String?
    var teacher: String?
    var color: String?
    var note: String?
}

struct CourseSuspensionDto: Codable, Equatable, Identifiable {
    let id: String
    let courseId: String
    let date: String
    let reason: String?
    let createdAt: String
    let updatedAt: String
}

struct CourseSuspensionCreateInput: Codable, Equatable {
    let date: String
    var reason: String?
}

struct MeetingBulkCreateInput: Codable, Equatable {
    let userTimetableId: String
    let courseId: String
    let dayOfWeek: Int
    let startPeriodIndexes: [Int]
    var room: String?
}

struct MeetingUpdateInput: Codable, Equatable {
    var dayOfWeek: Int?
    var startPeriodIndex: Int?
    var periodCount: Int?
    var room: String?
}

struct UserTimetableDto: Codable, Equatable, Identifiable {
    let id: String
    let userId: String
    let semesterId: String
    let title: String
    let sourceTemplateId: String?
    let daysOfWeek: [Int]
    let daySlots: [DaySlotDto]
    let courses: [CourseDto]
    let meetings: [MeetingDto]
    let createdAt: String
    let updatedAt: String
}

struct UserTimetableCreateInput: Codable, Equatable {
    let semesterId: String
    let title: String
    var description: String?
    var year: Int?
    var term: String?
    var daySlots: [TemplateCreateInput.DaySlotCreateInput]
    var courses: [TemplateCreateInput.CourseTemplateInput]
    var meetings: [TemplateCreateInput.MeetingTemplateInput]
}

struct UserTimetablePatchInput: Codable, Equatable {
    var title: String?
    var daysOfWeek: [Int]?
    var daySlots: [TemplateCreateInput.DaySlotCreateInput]?
    var courses: [CoursePatchInput]?
    var meetings: [MeetingPatchInput]?

    struct CoursePatchInput: Codable, Equatable {
        var id: String?
        var tempId: String?
        let name: String
        var teacher: String?
        var color: String?
        var note: String?
    }

    struct MeetingPatchInput: Codable, Equatable {
        var id: String?
        var courseId: String?
        var courseTempId: String?
        let dayOfWeek: Int
        let startPeriodIndex: Int
        var periodCount: Int = 1
        var room: String?
    }
}

struct TimetableSuspensionDto: Codable, Equatable, Identifiable {
    let id: String
    let userTimetableId: String
    let date: String
    let reason: String?
    let createdAt: String
    let updatedAt: String
}

struct TimetableSuspensionCreateInput: Codable, Equatable {
    let date: String
    var reason: String?
}

struct BulkTimetableSuspensionInput: Codable, Equatable {
    let dates: [String]
    var reason: String?
}

struct BulkTimetableSuspensionResponse: Codable, Equatable {
    let createdCount: Int
    let skippedCount: Int
}

struct BulkTimetableSuspensionRemoveInput: Codable, Equatable {
    let dates: [String]
}

struct BulkTimetableSuspensionRemoveResponse: Codable, Equatable {
    let removedCount: Int
}

struct RecurrenceEndDto: Codable, Equatable {
    let kind: String            // "never" | "until" | "count"
    var date: String? = nil     // kind == "until"
    var count: Int? = nil       // kind == "count"
}

struct RecurrenceSpecDto: Codable, Equatable {
    var freq: String            // "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
    var interval: Int
    var byDay: [String]         // "MO".."SU"
    var monthlyMode: String?    // "BYMONTHDAY" | "BYDAY" | nil
    var end: RecurrenceEndDto
}

struct OccurrenceDayDto: Codable, Equatable {
    let date: String
    let startMinute: Int
    let endMinute: Int
}

struct PersonalEventSeriesDto: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let start: String
    let end: String
    let isAllDay: Bool
    let location: String?
    let note: String?
    let color: String?
    let recurrenceRule: String?
    let recurrenceSpec: RecurrenceSpecDto?
    let exDates: [String]
    let rDates: [String]
    let source: String
    let ekExternalId: String?
    let ekCalendarId: String?
    let createdAt: String
    let updatedAt: String
}

struct PersonalEventOccurrenceDto: Codable, Equatable, Identifiable {
    let seriesId: String
    let occurrenceDate: String
    let start: String
    let end: String
    let days: [OccurrenceDayDto]
    let isAllDay: Bool
    let title: String
    let location: String?
    let note: String?
    let color: String?
    let isRecurringOccurrence: Bool
    let recurrenceRule: String?
    let recurrenceSpec: RecurrenceSpecDto?
    let overrideId: String?
    let source: String
    let ekExternalId: String?
    let ekCalendarId: String?
    let createdAt: String
    let updatedAt: String

    // wire に id は無い。Identifiable は計算プロパティで満たす
    var id: String { "\(seriesId):\(occurrenceDate)" }
    private enum CodingKeys: String, CodingKey {
        case seriesId, occurrenceDate, start, end, days, isAllDay, title, location, note, color
        case isRecurringOccurrence, recurrenceRule, recurrenceSpec, overrideId, source
        case ekExternalId, ekCalendarId, createdAt, updatedAt
    }
}

struct PersonalEventRecurrenceInput: Codable, Equatable {
    var spec: RecurrenceSpecDto? = nil
    var rrule: String? = nil
    var exDates: [String] = []
    var rDates: [String] = []
}

struct PersonalEventCreateInput: Codable, Equatable {
    let title: String
    let start: String
    let end: String
    var isAllDay: Bool = false
    var location: String? = nil
    var note: String? = nil
    var color: String? = nil
    var recurrence: PersonalEventRecurrenceInput? = nil
    var source: String? = nil
    var ekExternalId: String? = nil
    var ekCalendarId: String? = nil
    var ekLastModified: String? = nil
}

struct PersonalEventUpdateInput: Codable, Equatable {
    var title: String? = nil
    var start: String? = nil
    var end: String? = nil
    var isAllDay: Bool? = nil
    var location: String? = nil
    var note: String? = nil
    var color: String? = nil
    var recurrence: PersonalEventRecurrenceInput? = nil
    var clearRecurrence: Bool = false
    var editScope: String = "all"          // "single" | "future" | "all"
    var originalDate: String? = nil
    var ekExternalId: String? = nil
    var ekCalendarId: String? = nil
}

struct EventKitSyncEvent: Codable, Equatable {
    let ekExternalId: String
    let ekCalendarId: String
    let ekOccurrenceStart: String
    let ekLastModified: String?
    let start: String
    let end: String
    let isAllDay: Bool
    let title: String
    let location: String?
}

struct EventKitSyncInput: Codable, Equatable {
    struct Range: Codable, Equatable {
        let from: String
        let to: String
    }

    let range: Range
    let events: [EventKitSyncEvent]
}

struct EventKitSyncResponse: Codable, Equatable {
    let mirrors: [PersonalEventSeriesDto]
}

struct DayDetailDto: Codable, Equatable {
    let date: String
    let occurrences: [OccurrenceDto]
    let courseSuspensions: [CourseSuspensionDto]
    let timetableSuspension: TimetableSuspensionDto?
    let personalEvents: [PersonalEventOccurrenceDto]
}

struct FriendshipUserDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String?
    let handle: String?
    let image: String?
}

struct FriendshipDto: Codable, Equatable, Identifiable {
    let id: String
    let sender: FriendshipUserDto
    let receiver: FriendshipUserDto
    let status: FriendshipStatus
    let createdAt: String
    let acceptedAt: String?
}

struct CreateFriendshipInput: Codable, Equatable {
    var receiverHandle: String?
    var receiverInviteCode: String?
    var receiverId: String?
}

struct UserSearchDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String?
    let handle: String?
    let image: String?
    let friendshipStatus: FriendshipStatus?
}

struct RoomSummaryDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let showMemberTimetables: Bool
    let memberCount: Int
    let myRole: RoomRole
    let upcomingEvent: UpcomingEvent?
    let createdAt: String

    struct UpcomingEvent: Codable, Equatable {
        let id: String
        let title: String
        let start: String
    }
}

struct RoomDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let showMemberTimetables: Bool
    let memberCount: Int
    let myRole: RoomRole
    let upcomingEvent: RoomSummaryDto.UpcomingEvent?
    let createdAt: String
    let inviteCode: String
    let inviteExpiresAt: String?
}

struct RoomMemberDto: Codable, Equatable, Identifiable {
    var id: String { userId }
    let userId: String
    let name: String?
    let handle: String?
    let image: String?
    let role: RoomRole
    let joinedAt: String
}

struct RoomEventDto: Codable, Equatable, Identifiable {
    let id: String
    let seriesId: String
    let roomId: String
    let authorId: String
    let title: String
    let rawTitle: String?
    let description: String?
    let start: String
    let end: String
    let isAllDay: Bool
    let color: String?
    let source: RoomEventSource
    let visibilityMode: VisibilityMode
    let isRecurringOccurrence: Bool
    let recurrenceRule: String?
    let occurrenceDate: String
    let overrideId: String?
    let googleSyncId: String?
    let googleEventId: String?
    let googleRecurringEventId: String?
    let createdAt: String
}

struct RoomWeekDto: Codable, Equatable {
    let weekStart: String
    let weekEnd: String
    let members: [Member]
    let meetings: [Meeting]
    let recurringMeetings: [RecurringMeeting]
    let roomEvents: [RoomEventDto]

    struct Member: Codable, Equatable, Identifiable {
        var id: String { userId }
        let userId: String
        let name: String?
        let handle: String?
        let image: String?
        let color: String
    }

    struct Meeting: Codable, Equatable {
        let userId: String
        let occurrenceId: String
        let courseId: String
        let courseName: String
        let courseColor: String?
        let date: String
        let startMinute: Double
        let endMinute: Double
    }

    struct RecurringMeeting: Codable, Equatable {
        let userId: String
        let timetableId: String
        let courseId: String
        let courseName: String
        let courseColor: String?
        let dayOfWeek: Int
        let startPeriodIndex: Int
        let periodCount: Int
    }

    init(
        weekStart: String,
        weekEnd: String,
        members: [Member],
        meetings: [Meeting],
        recurringMeetings: [RecurringMeeting] = [],
        roomEvents: [RoomEventDto]
    ) {
        self.weekStart = weekStart
        self.weekEnd = weekEnd
        self.members = members
        self.meetings = meetings
        self.recurringMeetings = recurringMeetings
        self.roomEvents = roomEvents
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        weekStart = try container.decode(String.self, forKey: .weekStart)
        weekEnd = try container.decode(String.self, forKey: .weekEnd)
        members = try container.decode([Member].self, forKey: .members)
        meetings = try container.decode([Meeting].self, forKey: .meetings)
        recurringMeetings = try container.decodeIfPresent([RecurringMeeting].self, forKey: .recurringMeetings) ?? []
        roomEvents = try container.decode([RoomEventDto].self, forKey: .roomEvents)
    }
}

struct CreateRoomInput: Codable, Equatable {
    let name: String
    var description: String?
    var showMemberTimetables: Bool?
}

struct UpdateRoomInput: Codable, Equatable {
    var name: String?
    var description: String?
    var showMemberTimetables: Bool?
}

struct CreateRoomEventInput: Codable, Equatable {
    let title: String
    var description: String?
    let start: String
    let end: String
    var isAllDay: Bool = false
    var color: String?
    var recurrence: Recurrence?
    var visibilityMode: VisibilityMode = .normal

    struct Recurrence: Codable, Equatable {
        let rrule: String
        var exDates: [String] = []
        var rDates: [String] = []
    }
}

struct UpdateRoomEventInput: Codable, Equatable {
    var title: String?
    var description: String?
    var start: String?
    var end: String?
    var isAllDay: Bool?
    var color: String?
    var recurrence: CreateRoomEventInput.Recurrence?
    var visibilityMode: VisibilityMode?
    var editScope: String = "all"
    var originalDate: String?
}

struct PersonalCalendarShareDto: Codable, Equatable, Identifiable {
    let id: String
    let roomId: String
    let userId: String
    let visibilityMode: VisibilityMode
    let enabled: Bool
    let createdAt: String
    let updatedAt: String
}

struct SharePutInput: Codable, Equatable {
    var visibilityMode: VisibilityMode
}

struct SharePatchInput: Codable, Equatable {
    var visibilityMode: VisibilityMode?
    var enabled: Bool?
}

struct SchoolDto: Codable, Equatable, Identifiable {
    let id: String
    let mextCode: String?
    let kind: SchoolKind
    let name: String
    let nameKana: String?
    let prefecture: String?
}

struct DepartmentDto: Codable, Equatable, Identifiable {
    let id: String
    let schoolId: String
    let name: String
    let nameKana: String?
}

struct SchoolSearchQuery: Equatable {
    var q: String?
    var prefecture: String?
    var kind: SchoolKind?
    var limit: Int = 20
}

struct SchoolCreateInput: Codable, Equatable {
    let name: String
    var nameKana: String?
    let kind: SchoolKind
    var prefecture: String?
}

struct DepartmentCreateInput: Codable, Equatable {
    let name: String
    var nameKana: String?
}

struct AttendanceRuleDto: Codable, Equatable, Identifiable {
    let id: String
    let schoolId: String
    let departmentId: String
    let userId: String?
    let excusedStrategy: RuleStrategy
    let tardyStrategy: RuleStrategy
    let earlyLeaveStrategy: RuleStrategy
}

struct AttendanceRuleUpsertInput: Codable, Equatable {
    let excusedStrategy: RuleStrategy
    let tardyStrategy: RuleStrategy
    let earlyLeaveStrategy: RuleStrategy
}

struct AttendanceRuleUpsertBody: Codable, Equatable {
    let excusedStrategy: RuleStrategy
    let tardyStrategy: RuleStrategy
    let earlyLeaveStrategy: RuleStrategy
    let schoolId: String?
    let departmentId: String?
}

struct AttendanceRuleResponse: Codable, Equatable {
    let rule: AttendanceRuleDto
}

struct EffectiveRuleResponse: Codable, Equatable {
    let `default`: AttendanceRuleDto?
    let userOverride: AttendanceRuleDto?
    let effective: Effective

    struct Effective: Codable, Equatable {
        let excusedStrategy: RuleStrategy
        let tardyStrategy: RuleStrategy
        let earlyLeaveStrategy: RuleStrategy
    }
}

struct IcsImportDto: Codable, Equatable, Identifiable {
    let id: String
    let filename: String?
    let source: IcsSource
    let status: IcsImportStatus
    let parsedEventCount: Int
    let committedEventCount: Int
    let skippedEventCount: Int
    let errorMessage: String?
    let committedAt: String?
    let createdAt: String
}

struct IcsImportPreviewItem: Codable, Equatable, Identifiable {
    var id: String { uid }
    let uid: String
    let rawTitle: String
    let mappedTitle: String
    let visibilityMode: VisibilityMode
    let ruleId: String?
    let start: String
    let end: String
    let isRecurring: Bool
    let rrule: String?
}

struct IcsImportPreview: Codable, Equatable {
    let importId: String
    let events: [IcsImportPreviewItem]
}

struct IcsImportCommitResult: Codable, Equatable {
    let committed: Int
    let skipped: Int
    let errors: [String]
}

struct IcsTitleRuleDto: Codable, Equatable, Identifiable {
    let id: String
    let matchType: IcsMatchType
    let pattern: String
    let replaceWith: String?
    let visibilityMode: VisibilityMode
    let priority: Int
    let isDefault: Bool
    let createdAt: String
    let updatedAt: String
}

struct CreateIcsTitleRuleInput: Codable, Equatable {
    var matchType: IcsMatchType
    var pattern: String
    var replaceWith: String?
    var visibilityMode: VisibilityMode?
    var priority: Int?
}

struct PatchIcsTitleRuleInput: Codable, Equatable {
    var matchType: IcsMatchType?
    var pattern: String?
    var replaceWith: String?
    var visibilityMode: VisibilityMode?
    var priority: Int?
}

struct UserTimetableListResponse: Codable, Equatable {
    let userTimetables: [UserTimetableDto]
}

struct UserTimetableResponse: Codable, Equatable {
    let userTimetable: UserTimetableDto
}

struct SemestersResponse: Codable, Equatable {
    let semesters: [SemesterDto]
}

struct SemesterResponse: Codable, Equatable {
    let semester: SemesterDto
}

struct SchoolsResponse: Codable, Equatable {
    let schools: [SchoolDto]
}

struct SchoolResponse: Codable, Equatable {
    let school: SchoolDto
}

struct DepartmentsResponse: Codable, Equatable {
    let departments: [DepartmentDto]
}

struct DepartmentResponse: Codable, Equatable {
    let department: DepartmentDto
}

struct TemplatesResponse: Codable, Equatable {
    let templates: [TemplateDto]
    let nextCursor: String?
}

struct TemplateResponse: Codable, Equatable {
    let template: TemplateDto
}

struct CourseResponse: Codable, Equatable {
    let course: CourseDto
}

struct MeetingResponse: Codable, Equatable {
    let meeting: MeetingDto
}

struct MeetingsResponse: Codable, Equatable {
    let meetings: [MeetingDto]
}

struct CourseSuspensionsResponse: Codable, Equatable {
    let suspensions: [CourseSuspensionDto]
}

struct CourseSuspensionResponse: Codable, Equatable {
    let suspension: CourseSuspensionDto
}

struct TimetableSuspensionsResponse: Codable, Equatable {
    let suspensions: [TimetableSuspensionDto]
}

struct TimetableSuspensionResponse: Codable, Equatable {
    let suspension: TimetableSuspensionDto
}

struct PersonalEventsResponse: Codable, Equatable {
    let events: [PersonalEventOccurrenceDto]
}

struct PersonalEventResponse: Codable, Equatable {
    let event: PersonalEventSeriesDto
}

struct FriendshipsResponse: Codable, Equatable {
    let friendships: [FriendshipDto]
}

struct FriendshipResponse: Codable, Equatable {
    let friendship: FriendshipDto
}

struct UsersSearchResponse: Codable, Equatable {
    let users: [UserSearchDto]
}

struct RoomsResponse: Codable, Equatable {
    let rooms: [RoomSummaryDto]
}

struct RoomResponse: Codable, Equatable {
    let room: RoomDto
}

struct RoomMembersResponse: Codable, Equatable {
    let members: [RoomMemberDto]
}

struct RoomEventsResponse: Codable, Equatable {
    let events: [RoomEventDto]
}

struct RoomEventResponse: Codable, Equatable {
    let event: RoomEventDto
}

struct PersonalCalendarShareResponse: Codable, Equatable {
    let share: PersonalCalendarShareDto?
}

struct RoomInviteResponse: Codable, Equatable {
    let inviteCode: String
    let inviteExpiresAt: String
}

struct IcsImportsResponse: Codable, Equatable {
    let imports: [IcsImportDto]
}

struct IcsUploadResponse: Codable, Equatable {
    struct ImportRef: Codable, Equatable {
        let id: String
    }

    let `import`: ImportRef
    let parsedCount: Int
    let dedup: Bool
}

struct IcsTitleRulesResponse: Codable, Equatable {
    let rules: [IcsTitleRuleDto]
}

struct IcsTitleRuleResponse: Codable, Equatable {
    let rule: IcsTitleRuleDto
}

struct VersionResponse: Codable, Equatable {
    let commit: String
    let minIOSBuild: Int
}
