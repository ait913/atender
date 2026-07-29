import Foundation

/// 書き出し専用のリポジトリ (§6.6)。
/// QueryClient にキャッシュしない — 書き出しは常に最新を読む必要があり、
/// キャッシュすると QueryKey と InvalidationMatrix に新ケースが要るため。
@MainActor
final class CalendarExportRepository {
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func occurrenceRange(from: String, to: String) async throws -> OccurrenceRangeResponse {
        try await client.send(Endpoints.occurrenceRange(from: from, to: to), as: OccurrenceRangeResponse.self)
    }

    func legacyEkPushes() async throws -> [String] {
        try await client.send(Endpoints.legacyEkPushes(), as: LegacyEkPushListResponse.self).externalIds
    }

    func clearLegacyEkPushes(_ externalIds: [String]) async throws -> Int {
        try await client.send(
            Endpoints.clearLegacyEkPushes(LegacyEkPushClearInput(externalIds: externalIds)),
            as: LegacyEkPushClearResponse.self
        ).clearedCount
    }
}
