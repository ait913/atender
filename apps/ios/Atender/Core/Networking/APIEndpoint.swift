import Foundation

struct APIEndpoint {
    let path: String
    let method: HTTPMethod
    var query: [String: String] = [:]
    var body: Encodable? = nil
    var requiresAuth: Bool = true
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case delete = "DELETE"
}

enum Endpoints {
    static func me() -> APIEndpoint { .init(path: "/api/me", method: .get) }
    static func deleteMe() -> APIEndpoint { .init(path: "/api/me", method: .delete) }
    static func updateMe(_ body: MeUpdateInput) -> APIEndpoint { .init(path: "/api/me", method: .patch, body: body) }

    static func schools(_ query: SchoolSearchQuery) -> APIEndpoint { .init(path: "/api/schools", method: .get, query: query.asQuery) }
    static func createSchool(_ body: SchoolCreateInput) -> APIEndpoint { .init(path: "/api/schools", method: .post, body: body) }
    static func departments(schoolId: String, q: String? = nil, limit: Int = 20) -> APIEndpoint {
        .init(path: "/api/schools/\(schoolId)/departments", method: .get, query: compactQuery(["q": q, "limit": String(limit)]))
    }
    static func createDepartment(schoolId: String, _ body: DepartmentCreateInput) -> APIEndpoint {
        .init(path: "/api/schools/\(schoolId)/departments", method: .post, body: body)
    }

    static func semesters() -> APIEndpoint { .init(path: "/api/semesters", method: .get) }
    static func createSemester(_ body: SemesterCreateInput) -> APIEndpoint { .init(path: "/api/semesters", method: .post, body: body) }
    static func semester(id: String) -> APIEndpoint { .init(path: "/api/semesters/\(id)", method: .get) }
    static func updateSemester(id: String, _ body: SemesterUpdateInput) -> APIEndpoint { .init(path: "/api/semesters/\(id)", method: .patch, body: body) }
    static func deleteSemester(id: String) -> APIEndpoint { .init(path: "/api/semesters/\(id)", method: .delete) }
    static func semesterOverview(id: String) -> APIEndpoint { .init(path: "/api/semesters/\(id)/overview", method: .get) }

    static func userTimetables() -> APIEndpoint { .init(path: "/api/user-timetables", method: .get) }
    static func userTimetable(id: String) -> APIEndpoint { .init(path: "/api/user-timetables/\(id)", method: .get) }
    static func createUserTimetable(_ body: UserTimetableCreateInput) -> APIEndpoint { .init(path: "/api/user-timetables", method: .post, body: body) }
    static func patchUserTimetable(id: String, _ body: UserTimetablePatchInput) -> APIEndpoint { .init(path: "/api/user-timetables/\(id)", method: .patch, body: body) }
    static func deleteUserTimetable(id: String) -> APIEndpoint { .init(path: "/api/user-timetables/\(id)", method: .delete) }
    static func publishAsTemplate(id: String, _ body: TemplatePublishInput) -> APIEndpoint {
        .init(path: "/api/user-timetables/\(id)/publish-as-template", method: .post, body: body)
    }

    static func templates(_ query: TemplateSearchQuery) -> APIEndpoint { .init(path: "/api/timetable-templates", method: .get, query: query.asQuery) }
    static func template(id: String) -> APIEndpoint { .init(path: "/api/timetable-templates/\(id)", method: .get) }
    static func createTemplate(_ body: TemplateCreateInput) -> APIEndpoint { .init(path: "/api/timetable-templates", method: .post, body: body) }
    static func copyTemplate(id: String, _ body: TemplateCopyInput) -> APIEndpoint { .init(path: "/api/timetable-templates/\(id)/copy", method: .post, body: body) }

    static func createCourse(_ body: CourseCreateInput) -> APIEndpoint { .init(path: "/api/courses", method: .post, body: body) }
    static func updateCourse(id: String, _ body: CourseUpdateInput) -> APIEndpoint { .init(path: "/api/courses/\(id)", method: .patch, body: body) }
    static func deleteCourse(id: String) -> APIEndpoint { .init(path: "/api/courses/\(id)", method: .delete) }
    static func courseSuspensions(courseId: String) -> APIEndpoint { .init(path: "/api/courses/\(courseId)/suspensions", method: .get) }
    static func createCourseSuspension(courseId: String, _ body: CourseSuspensionCreateInput) -> APIEndpoint {
        .init(path: "/api/courses/\(courseId)/suspensions", method: .post, body: body)
    }
    static func deleteCourseSuspension(courseId: String, id: String) -> APIEndpoint {
        .init(path: "/api/courses/\(courseId)/suspensions/\(id)", method: .delete)
    }

    static func createMeetingsBulk(_ body: MeetingBulkCreateInput) -> APIEndpoint { .init(path: "/api/meetings/bulk", method: .post, body: body) }
    static func updateMeeting(id: String, _ body: MeetingUpdateInput) -> APIEndpoint { .init(path: "/api/meetings/\(id)", method: .patch, body: body) }
    static func deleteMeeting(id: String) -> APIEndpoint { .init(path: "/api/meetings/\(id)", method: .delete) }

    static func today(date: String? = nil) -> APIEndpoint { .init(path: "/api/today", method: .get, query: compactQuery(["date": date])) }
    static func markAttendance(occurrenceId: String, _ body: MarkAttendanceInput) -> APIEndpoint {
        .init(path: "/api/attendance/\(occurrenceId)", method: .post, body: body)
    }
    static func deleteAttendance(occurrenceId: String) -> APIEndpoint { .init(path: "/api/attendance/\(occurrenceId)", method: .delete) }
    static func markAllPresent(_ body: MarkAllPresentInput) -> APIEndpoint { .init(path: "/api/attendance/mark-all-present", method: .post, body: body) }
    static func bulkAttendance(_ body: BulkMarkAttendanceInput) -> APIEndpoint { .init(path: "/api/attendance/bulk", method: .post, body: body) }
    static func bulkClearAttendance(_ body: BulkClearAttendanceInput) -> APIEndpoint { .init(path: "/api/attendance/bulk-clear", method: .post, body: body) }
    static func attendanceRules(schoolId: String?, departmentId: String?) -> APIEndpoint {
        .init(path: "/api/attendance-rules", method: .get, query: compactQuery(["schoolId": schoolId, "departmentId": departmentId]))
    }
    static func upsertAttendanceRule(type: String, _ body: AttendanceRuleUpsertBody) -> APIEndpoint {
        .init(path: "/api/attendance-rules/\(type)", method: .patch, body: body)
    }

    static func createClassTransfer(_ body: ClassTransferCreateInput) -> APIEndpoint { .init(path: "/api/class-transfers", method: .post, body: body) }
    static func deleteClassTransfer(id: String) -> APIEndpoint { .init(path: "/api/class-transfers/\(id)", method: .delete) }

    static func dayDetail(date: String) -> APIEndpoint { .init(path: "/api/day/\(date)", method: .get) }
    static func stats(semesterId: String?) -> APIEndpoint { .init(path: "/api/stats", method: .get, query: compactQuery(["semesterId": semesterId])) }

    static func timetableSuspensions(from: String? = nil, to: String? = nil) -> APIEndpoint {
        .init(path: "/api/timetable-suspensions", method: .get, query: compactQuery(["from": from, "to": to]))
    }
    static func createTimetableSuspension(_ body: TimetableSuspensionCreateInput) -> APIEndpoint { .init(path: "/api/timetable-suspensions", method: .post, body: body) }
    static func deleteTimetableSuspension(id: String) -> APIEndpoint { .init(path: "/api/timetable-suspensions/\(id)", method: .delete) }
    static func bulkTimetableSuspension(_ body: BulkTimetableSuspensionInput) -> APIEndpoint { .init(path: "/api/timetable-suspensions/bulk", method: .post, body: body) }
    static func bulkRemoveTimetableSuspension(_ body: BulkTimetableSuspensionRemoveInput) -> APIEndpoint {
        .init(path: "/api/timetable-suspensions/bulk-remove", method: .post, body: body)
    }

    static func occurrenceRange(from: String, to: String, semesterId: String? = nil) -> APIEndpoint {
        .init(path: "/api/occurrences", method: .get,
              query: compactQuery(["from": from, "to": to, "semesterId": semesterId]))
    }

    static func friendships(status: String? = nil, direction: String? = nil) -> APIEndpoint {
        .init(path: "/api/friendships", method: .get, query: compactQuery(["status": status, "direction": direction]))
    }
    static func createFriendship(_ body: CreateFriendshipInput) -> APIEndpoint { .init(path: "/api/friendships", method: .post, body: body) }
    static func friendshipAction(id: String, action: String) -> APIEndpoint { .init(path: "/api/friendships/\(id)/\(action)", method: .post) }
    static func deleteFriendship(id: String) -> APIEndpoint { .init(path: "/api/friendships/\(id)", method: .delete) }
    static func searchUsers(handle: String) -> APIEndpoint { .init(path: "/api/users/search", method: .get, query: ["handle": handle]) }

    static func rooms() -> APIEndpoint { .init(path: "/api/rooms", method: .get) }
    static func createRoom(_ body: CreateRoomInput) -> APIEndpoint { .init(path: "/api/rooms", method: .post, body: body) }
    static func room(id: String) -> APIEndpoint { .init(path: "/api/rooms/\(id)", method: .get) }
    static func updateRoom(id: String, _ body: UpdateRoomInput) -> APIEndpoint { .init(path: "/api/rooms/\(id)", method: .patch, body: body) }
    static func deleteRoom(id: String) -> APIEndpoint { .init(path: "/api/rooms/\(id)", method: .delete) }
    static func joinRoom(inviteCode: String) -> APIEndpoint { .init(path: "/api/rooms/join", method: .post, body: ["inviteCode": inviteCode]) }
    static func leaveRoom(id: String) -> APIEndpoint { .init(path: "/api/rooms/\(id)/leave", method: .post) }
    static func regenerateRoomInvite(id: String) -> APIEndpoint { .init(path: "/api/rooms/\(id)/invite", method: .post) }
    static func roomMembers(id: String) -> APIEndpoint { .init(path: "/api/rooms/\(id)/members", method: .get) }
    static func removeRoomMember(id: String, userId: String) -> APIEndpoint { .init(path: "/api/rooms/\(id)/members/\(userId)", method: .delete) }
    static func roomWeek(id: String, weekStart: String, semesterId: String? = nil) -> APIEndpoint {
        .init(path: "/api/rooms/\(id)/week", method: .get,
              query: compactQuery(["weekStart": weekStart, "semesterId": semesterId]))
    }
}

private func compactQuery(_ values: [String: String?]) -> [String: String] {
    values.compactMapValues { $0 }
}

extension SchoolSearchQuery {
    var asQuery: [String: String] {
        compactQuery([
            "q": q,
            "prefecture": prefecture,
            "kind": kind?.rawValue,
            "limit": String(limit),
        ])
    }
}

extension TemplateSearchQuery {
    var asQuery: [String: String] {
        compactQuery([
            "schoolId": schoolId,
            "departmentId": departmentId,
            "q": q,
            "limit": String(limit),
            "cursor": cursor,
        ])
    }
}
