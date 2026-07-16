import Foundation
import Observation

@MainActor
@Observable
final class SchoolRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func schools(_ query: SchoolSearchQuery, force: Bool = false) async throws -> [SchoolDto] {
        let key = QueryKey(["schools", query.q ?? "none", query.prefecture ?? "none", query.kind?.rawValue ?? "none", String(query.limit)])
        if !force, !cache.isStale(key), let cached: [SchoolDto] = cache.data(for: key, as: [SchoolDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.schools(query), as: SchoolsResponse.self)
        cache.setData(response.schools, for: key)
        return response.schools
    }

    func createSchool(_ input: SchoolCreateInput) async throws -> SchoolDto {
        let response = try await client.send(Endpoints.createSchool(input), as: SchoolResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .schoolCreate))
        return response.school
    }

    func departments(schoolId: String, q: String?, force: Bool = false) async throws -> [DepartmentDto] {
        let key = QueryKey(["departments", schoolId, q ?? "none", "50"])
        if !force, !cache.isStale(key), let cached: [DepartmentDto] = cache.data(for: key, as: [DepartmentDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.departments(schoolId: schoolId, q: q, limit: 50), as: DepartmentsResponse.self)
        cache.setData(response.departments, for: key)
        return response.departments
    }

    func createDepartment(schoolId: String, _ input: DepartmentCreateInput) async throws -> DepartmentDto {
        let response = try await client.send(Endpoints.createDepartment(schoolId: schoolId, input), as: DepartmentResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .departmentCreate(schoolId: schoolId)))
        return response.department
    }
}
