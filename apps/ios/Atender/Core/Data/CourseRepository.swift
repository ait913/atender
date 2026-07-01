import Foundation
import Observation

@MainActor
@Observable
final class CourseRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func courseSuspensions(courseId: String, force: Bool = false) async throws -> [CourseSuspensionDto] {
        if !force, !cache.isStale(.courseSuspensions(courseId)), let cached: [CourseSuspensionDto] = cache.data(for: .courseSuspensions(courseId), as: [CourseSuspensionDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.courseSuspensions(courseId: courseId), as: CourseSuspensionsResponse.self)
        cache.setData(response.suspensions, for: .courseSuspensions(courseId))
        return response.suspensions
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

    func deleteCourse(id: String) async throws {
        try await client.send(Endpoints.deleteCourse(id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .deleteCourse))
    }
}
