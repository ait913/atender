import Foundation

struct QueryKey: Hashable, ExpressibleByArrayLiteral {
    let parts: [String]

    init(_ parts: [String]) {
        self.parts = parts
    }

    init(arrayLiteral elements: String...) {
        self.parts = elements
    }

    func hasPrefix(_ other: QueryKey) -> Bool {
        guard other.parts.count <= parts.count else { return false }
        return Array(parts.prefix(other.parts.count)) == other.parts
    }

    static func me() -> QueryKey { .init(["me"]) }
    static func schools() -> QueryKey { .init(["schools"]) }
    static func departments(_ schoolId: String? = nil) -> QueryKey { .init(["departments", schoolId ?? "none"]) }
    static func semesters() -> QueryKey { .init(["semesters"]) }
    static func templates() -> QueryKey { .init(["templates"]) }
    static func userTimetables() -> QueryKey { .init(["user-timetables"]) }
    static func userTimetable(_ id: String) -> QueryKey { .init(["user-timetables", id]) }
    static func today(_ date: String? = nil) -> QueryKey { .init(["today", date ?? "current"]) }
    static func dayDetail(_ date: String? = nil) -> QueryKey { .init(["day", date ?? "none"]) }
    static func dayPrefix() -> QueryKey { .init(["day"]) }
    static func stats(_ semesterId: String? = nil) -> QueryKey { .init(["stats", semesterId ?? "current"]) }
    static func semesterOverview(_ id: String? = nil) -> QueryKey { .init(["semesters", id ?? "any", "overview"]) }
    static func courseSuspensions(_ courseId: String) -> QueryKey { .init(["courses", courseId, "suspensions"]) }
    static func timetableSuspensions() -> QueryKey { .init(["timetable-suspensions"]) }
    static func personalEvents() -> QueryKey { .init(["personal-events"]) }
    static func rules() -> QueryKey { .init(["attendance-rules"]) }
    static func friendships() -> QueryKey { .init(["friendships"]) }
    static func friendshipsPendingCount() -> QueryKey { .init(["friendships", "pending-count"]) }
    static func usersSearch() -> QueryKey { .init(["users", "search"]) }
    static func rooms() -> QueryKey { .init(["rooms"]) }
    static func room(_ id: String) -> QueryKey { .init(["rooms", id]) }
    static func roomMembers(_ id: String) -> QueryKey { .init(["rooms", id, "members"]) }
    static func roomWeek(_ id: String) -> QueryKey { .init(["rooms", id, "week"]) }
    static func roomEvents(_ id: String) -> QueryKey { .init(["rooms", id, "events"]) }
    static func icsImports(_ id: String) -> QueryKey { .init(["rooms", id, "ics-imports"]) }
    static func googleSyncs(_ roomId: String) -> QueryKey { .init(["rooms", roomId, "google-calendar-syncs"]) }
    static func icsTitleRules() -> QueryKey { .init(["me", "ics-title-rules"]) }
    static func googleConnection() -> QueryKey { .init(["me", "google-calendar", "connection"]) }
    static func googleCalendars() -> QueryKey { .init(["me", "google-calendar", "calendars"]) }
}
