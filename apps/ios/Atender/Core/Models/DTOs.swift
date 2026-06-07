import Foundation

// mirror of packages/shared/src/schemas/me.ts MeResponseDto
struct MeResponse: Codable, Equatable {
    let user: User
    let setupStatus: SetupStatus

    struct User: Codable, Equatable {
        let id: String
        let email: String
        let name: String?
        let image: String?
        let handle: String?
        let inviteCode: String?
        let defaultSemesterId: String?
        let schoolId: String?
        let departmentId: String?
    }
}

// mirror of packages/shared/src/schemas/me.ts MeResponseDto.setupStatus
struct SetupStatus: Codable, Equatable {
    let hasSchool: Bool
    let hasDepartment: Bool
    let hasSemester: Bool
    let hasUserTimetable: Bool
    let isComplete: Bool
}

// mirror of packages/shared/src/schemas/semester.ts SemesterDto
struct SemesterDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let startDate: String
    let endDate: String
}

// mirror of packages/shared/src/schemas/semester.ts SemesterOverviewDto
struct SemesterOverviewDto: Codable, Equatable {
    let semesterId: String
    let semesterName: String
    let startDate: String
    let endDate: String
    let overall: Overall
    let days: [AttendanceDaySummary]
    let courses: [CourseStatsDto]

    struct Overall: Codable, Equatable {
        let effectiveNumerator: Double
        let effectiveDenominator: Double
        let attendanceRate: Double?
    }
}

// mirror of packages/shared/src/schemas/semester.ts AttendanceDaySummary
struct AttendanceDaySummary: Codable, Equatable, Identifiable {
    var id: String { date }
    let date: String
    let status: AttendanceDayStatus
    let occurrenceCount: Int
}

// mirror of packages/shared/src/schemas/stats.ts CourseStatsDto
struct CourseStatsDto: Codable, Equatable, Identifiable {
    var id: String { courseId }
    let courseId: String
    let courseName: String
    let teacher: String?
    let totalSessions: Int
    let generatedOccurrences: Int
    let counts: Counts
    let effectiveNumerator: Double
    let effectiveDenominator: Double
    let attendanceRate: Double?
    let separateCounts: [String: Int]?

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
}

// mirror of packages/shared/src/schemas/userTimetable.ts UserTimetableDto
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

// mirror of packages/shared/src/schemas/template.ts DaySlotDto
struct DaySlotDto: Codable, Equatable, Identifiable {
    var id: Int { periodIndex }
    let periodIndex: Int
    let label: String
    let startMinute: Int
    let endMinute: Int
    let isBreak: Bool
}

// mirror of packages/shared/src/schemas/template.ts CourseDto
struct CourseDto: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let teacher: String?
    let color: String?
    let totalSessions: Int
    let note: String?
}

// mirror of packages/shared/src/schemas/template.ts MeetingDto
struct MeetingDto: Codable, Equatable, Identifiable {
    let id: String
    let courseId: String
    let dayOfWeek: Int
    let startPeriodIndex: Int
    let periodCount: Int
    let room: String?
}

// mirror of packages/shared/src/schemas/attendance.ts OccurrenceDto
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

// mirror of packages/shared/src/schemas/attendance.ts TodayResponse
struct TodayResponse: Codable, Equatable {
    let date: String
    let occurrences: [OccurrenceDto]
}

// mirror of packages/shared/src/schemas/attendance.ts MarkAttendanceInput
struct MarkAttendanceInput: Codable, Equatable {
    let status: AttendanceStatus
    let note: String?
}

// mirror of packages/shared/src/schemas/attendance.ts MarkAllPresentInput
struct MarkAllPresentInput: Codable, Equatable {
    let date: String?
}

// mirror of packages/shared/src/schemas/attendance.ts MarkAllPresentResponse
struct MarkAllPresentResponse: Codable, Equatable {
    let date: String
    let markedCount: Int
    let skippedCount: Int
}

// mirror of packages/shared/src/schemas/api.ts ErrorResponse
struct ErrorResponse: Codable, Equatable {
    let error: APIErrorBody

    struct APIErrorBody: Codable, Equatable {
        let code: String
        let message: String
    }
}
