import Foundation
import Observation

@MainActor
@Observable
final class DayRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func dayDetail(date: String, force: Bool = false) async throws -> DayDetailDto {
        if !force, !cache.isStale(.dayDetail(date)), let cached: DayDetailDto = cache.data(for: .dayDetail(date), as: DayDetailDto.self) {
            return cached
        }
        let response = try await client.send(Endpoints.dayDetail(date: date), as: DayDetailDto.self)
        cache.setData(response, for: .dayDetail(date))
        return response
    }

    func patchAttendance(occurrenceId: String, status: AttendanceStatus) async throws {
        _ = try await client.send(Endpoints.markAttendance(occurrenceId: occurrenceId, MarkAttendanceInput(status: status, note: nil)), as: AttendanceRecordResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .patchAttendance))
    }

    func deleteAttendance(occurrenceId: String) async throws {
        try await client.send(Endpoints.deleteAttendance(occurrenceId: occurrenceId))
        cache.invalidate(prefixes: invalidationTargets(for: .deleteAttendance))
    }

    func createTimetableSuspension(date: String, reason: String?) async throws -> TimetableSuspensionDto {
        let response = try await client.send(Endpoints.createTimetableSuspension(.init(date: date, reason: reason)), as: TimetableSuspensionResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .timetableSuspension(date: date)))
        return response.suspension
    }

    func deleteTimetableSuspension(id: String, date: String) async throws {
        try await client.send(Endpoints.deleteTimetableSuspension(id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .timetableSuspension(date: date)))
    }

    func createCourseSuspension(courseId: String, date: String, reason: String?) async throws -> CourseSuspensionDto {
        let response = try await client.send(Endpoints.createCourseSuspension(courseId: courseId, .init(date: date, reason: reason)), as: CourseSuspensionResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .courseSuspension(courseId: courseId)))
        return response.suspension
    }

    func deleteCourseSuspension(courseId: String, id: String) async throws {
        try await client.send(Endpoints.deleteCourseSuspension(courseId: courseId, id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .courseSuspension(courseId: courseId)))
    }

    func bulkMark(dates: [String], status: AttendanceStatus, mode: BulkMode) async throws -> BulkMarkAttendanceResponse {
        let response = try await client.send(Endpoints.bulkAttendance(.init(dates: dates, status: status, mode: mode)), as: BulkMarkAttendanceResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .bulkAttendance))
        return response
    }

    func bulkClear(dates: [String]) async throws -> BulkClearAttendanceResponse {
        let response = try await client.send(Endpoints.bulkClearAttendance(.init(dates: dates)), as: BulkClearAttendanceResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .bulkClearAttendance))
        return response
    }

    func bulkCreateTimetableSuspensions(dates: [String], reason: String?) async throws -> BulkTimetableSuspensionResponse {
        let response = try await client.send(Endpoints.bulkTimetableSuspension(.init(dates: dates, reason: reason)), as: BulkTimetableSuspensionResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .bulkTimetableSuspension))
        return response
    }

    func bulkRemoveTimetableSuspensions(dates: [String]) async throws -> BulkTimetableSuspensionRemoveResponse {
        let response = try await client.send(Endpoints.bulkRemoveTimetableSuspension(.init(dates: dates)), as: BulkTimetableSuspensionRemoveResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .bulkTimetableSuspension))
        return response
    }
}
