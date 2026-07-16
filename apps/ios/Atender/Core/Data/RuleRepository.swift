import Foundation
import Observation

@MainActor
@Observable
final class RuleRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func attendanceRules(schoolId: String?, departmentId: String?, force: Bool = false) async throws -> EffectiveRuleResponse? {
        guard let schoolId, !schoolId.isEmpty, let departmentId, !departmentId.isEmpty else { return nil }
        let key = QueryKey(["attendance-rules", schoolId, departmentId])
        if !force, !cache.isStale(key), let cached: EffectiveRuleResponse = cache.data(for: key, as: EffectiveRuleResponse.self) {
            return cached
        }
        let response = try await client.send(Endpoints.attendanceRules(schoolId: schoolId, departmentId: departmentId), as: EffectiveRuleResponse.self)
        cache.setData(response, for: key)
        return response
    }

    func upsertUserRule(_ input: AttendanceRuleUpsertInput, schoolId: String?, departmentId: String?) async throws -> AttendanceRuleDto {
        let body = AttendanceRuleUpsertBody(
            excusedStrategy: input.excusedStrategy,
            tardyStrategy: input.tardyStrategy,
            earlyLeaveStrategy: input.earlyLeaveStrategy,
            schoolId: schoolId,
            departmentId: departmentId
        )
        let response = try await client.send(Endpoints.upsertAttendanceRule(type: "user", body), as: AttendanceRuleResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .attendanceRuleUpsert))
        return response.rule
    }
}
