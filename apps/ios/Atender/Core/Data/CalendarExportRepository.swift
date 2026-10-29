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

    func occurrenceRange(from: String, to: String, semesterId: String? = nil) async throws -> OccurrenceRangeResponse {
        try await client.send(Endpoints.occurrenceRange(from: from, to: to, semesterId: semesterId), as: OccurrenceRangeResponse.self)
    }
}
