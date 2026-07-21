import Foundation
import Observation

@MainActor
@Observable
final class SemesterRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func semesters(force: Bool = false) async throws -> [SemesterDto] {
        if !force, !cache.isStale(.semesters()), let cached: [SemesterDto] = cache.data(for: .semesters(), as: [SemesterDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.semesters(), as: SemestersResponse.self)
        cache.setData(response.semesters, for: .semesters())
        return response.semesters
    }

    func semesterOverview(id: String, force: Bool = false) async throws -> SemesterOverviewDto {
        if !force, !cache.isStale(.semesterOverview(id)), let cached: SemesterOverviewDto = cache.data(for: .semesterOverview(id), as: SemesterOverviewDto.self) {
            return cached
        }
        let response = try await client.send(Endpoints.semesterOverview(id: id), as: SemesterOverviewDto.self)
        cache.setData(response, for: .semesterOverview(id))
        return response
    }

    func createSemester(_ input: SemesterCreateInput) async throws -> SemesterDto {
        let response = try await client.send(Endpoints.createSemester(input), as: SemesterResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .semesterCreate))
        return response.semester
    }

    func updateSemester(id: String, _ input: SemesterUpdateInput) async throws -> SemesterDto {
        let response = try await client.send(Endpoints.updateSemester(id: id, input), as: SemesterResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .semesterUpdate))
        return response.semester
    }

    func deleteSemester(id: String) async throws {
        try await client.send(Endpoints.deleteSemester(id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .semesterDelete))
    }
}

@MainActor
@Observable
final class TimetableRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func userTimetables(force: Bool = false) async throws -> [UserTimetableDto] {
        if !force, !cache.isStale(.userTimetables()), let cached: [UserTimetableDto] = cache.data(for: .userTimetables(), as: [UserTimetableDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.userTimetables(), as: UserTimetableListResponse.self)
        cache.setData(response.userTimetables, for: .userTimetables())
        return response.userTimetables
    }

    func createUserTimetable(_ input: UserTimetableCreateInput) async throws -> UserTimetableDto {
        let response = try await client.send(Endpoints.createUserTimetable(input), as: UserTimetableResponse.self)
        cache.invalidate(prefixes: [.userTimetables(), .me()])
        return response.userTimetable
    }

    func patchUserTimetable(id: String, _ input: UserTimetablePatchInput) async throws -> UserTimetableDto {
        let response = try await client.send(Endpoints.patchUserTimetable(id: id, input), as: UserTimetableResponse.self)
        cache.invalidate(prefixes: [.userTimetables(), QueryKey(["today"]), .semesters()])
        return response.userTimetable
    }

    func deleteUserTimetable(id: String) async throws {
        try await client.send(Endpoints.deleteUserTimetable(id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .userTimetableDelete))
    }

    func publishAsTemplate(id: String, title: String) async throws -> TemplateDto {
        let input = TemplatePublishInput(title: title, description: nil, year: nil, term: nil)
        let response = try await client.send(Endpoints.publishAsTemplate(id: id, input), as: TemplateResponse.self)
        return response.template
    }

    func createCourse(_ input: CourseCreateInput) async throws -> CourseDto {
        let response = try await client.send(Endpoints.createCourse(input), as: CourseResponse.self)
        cache.invalidate(prefixes: [.userTimetables(), QueryKey(["today"]), .semesters()])
        return response.course
    }

    func updateCourse(id: String, _ input: CourseUpdateInput) async throws -> CourseDto {
        let response = try await client.send(Endpoints.updateCourse(id: id, input), as: CourseResponse.self)
        cache.invalidate(prefixes: [.userTimetables(), QueryKey(["today"]), .semesters()])
        return response.course
    }

    func createMeetingsBulk(_ input: MeetingBulkCreateInput) async throws -> [MeetingDto] {
        let response = try await client.send(Endpoints.createMeetingsBulk(input), as: MeetingsResponse.self)
        cache.invalidate(prefixes: [.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .rooms(), .semesters()])
        return response.meetings
    }

    func updateMeeting(id: String, _ input: MeetingUpdateInput) async throws -> MeetingDto {
        let response = try await client.send(Endpoints.updateMeeting(id: id, input), as: MeetingResponse.self)
        cache.invalidate(prefixes: [.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .semesters()])
        return response.meeting
    }

    func deleteMeeting(id: String) async throws {
        try await client.send(Endpoints.deleteMeeting(id: id))
        cache.invalidate(prefixes: [.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .semesters()])
    }

    func templates(query: TemplateSearchQuery) async throws -> [TemplateDto] {
        let response = try await client.send(Endpoints.templates(query), as: TemplatesResponse.self)
        cache.setData(response.templates, for: .templates())
        return response.templates
    }

    func copyTemplate(id: String, input: TemplateCopyInput) async throws -> UserTimetableDto {
        let response = try await client.send(Endpoints.copyTemplate(id: id, input), as: UserTimetableResponse.self)
        cache.invalidate(prefixes: [.userTimetables(), .me()])
        return response.userTimetable
    }
}

@MainActor
@Observable
final class AttendanceRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient
    @ObservationIgnored private let toast: ToastCenter

    init(client: APIClient, cache: QueryClient, toast: ToastCenter) {
        self.client = client
        self.cache = cache
        self.toast = toast
    }

    func loadToday(date: String? = nil) async throws -> TodayResponse {
        if !cache.isStale(.today(date)), let cached: TodayResponse = cache.data(for: .today(date), as: TodayResponse.self) {
            return cached
        }
        let response = try await client.send(Endpoints.today(date: date), as: TodayResponse.self)
        cache.setData(response, for: .today(date))
        return response
    }

    func markAllPresent(date: String, status: AttendanceStatus) async {
        let snapshot = cache.snapshot(matching: QueryKey(["today"]), as: TodayResponse.self)
        for (key, today) in snapshot {
            cache.setData(AttendanceOptimistic.applyMarkAll(today, status: status), for: key)
        }
        do {
            _ = try await client.send(Endpoints.markAllPresent(MarkAllPresentInput(date: date, status: status)), as: MarkAllPresentResponse.self)
            cache.invalidate(prefixes: invalidationTargets(for: .markAllPresent))
        } catch {
            cache.restore(snapshot)
            toast.show("保存できませんでした、もう一度試してください")
        }
    }

    func patchAttendance(occurrenceId: String, status: AttendanceStatus) async {
        let snapshot = cache.snapshot(matching: QueryKey(["today"]), as: TodayResponse.self)
        for (key, today) in snapshot {
            cache.setData(AttendanceOptimistic.applyPatch(today, occurrenceId: occurrenceId, status: status), for: key)
        }
        do {
            _ = try await client.send(Endpoints.markAttendance(occurrenceId: occurrenceId, MarkAttendanceInput(status: status, note: nil)), as: AttendanceRecordResponse.self)
            cache.invalidate(prefixes: invalidationTargets(for: .patchAttendance))
        } catch {
            cache.restore(snapshot)
            toast.show("保存できませんでした、もう一度試してください")
        }
    }
}

@MainActor
@Observable
final class PersonalEventRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func personalEvents(from: String, to: String, semesterId: String?) async throws -> [PersonalEventDto] {
        let response = try await client.send(Endpoints.personalEvents(from: from, to: to, semesterId: semesterId), as: PersonalEventsResponse.self)
        cache.setData(response.events, for: .personalEvents())
        return response.events
    }

    func createPersonalEvent(_ input: PersonalEventCreateInput) async throws -> PersonalEventDto {
        let response = try await client.send(Endpoints.createPersonalEvent(input), as: PersonalEventResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .personalEvent(date: input.date)))
        return response.event
    }

    func updatePersonalEvent(id: String, _ input: PersonalEventUpdateInput) async throws -> PersonalEventDto {
        let response = try await client.send(Endpoints.updatePersonalEvent(id: id, input), as: PersonalEventResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .personalEvent(date: input.date)))
        return response.event
    }

    func deletePersonalEvent(id: String, date: String) async throws {
        try await client.send(Endpoints.deletePersonalEvent(id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .personalEvent(date: date)))
    }
}
