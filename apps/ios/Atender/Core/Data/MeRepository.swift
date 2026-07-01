import Foundation
import Observation

@MainActor
@Observable
final class MeRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func me() async throws -> MeResponse {
        let response = try await client.send(Endpoints.me(), as: MeResponse.self)
        cache.setData(response, for: .me())
        return response
    }
}
