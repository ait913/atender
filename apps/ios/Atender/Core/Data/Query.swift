import Foundation
import Observation

enum QueryState<Value> {
    case idle
    case loading
    case success(Value)
    case failure(APIError)
}

@MainActor
@Observable
final class Query<Value> {
    private(set) var state: QueryState<Value> = .idle
    @ObservationIgnored private let fetch: () async throws -> Value

    init(fetch: @escaping () async throws -> Value) {
        self.fetch = fetch
    }

    func load() async {
        state = .loading
        do {
            state = .success(try await fetch())
        } catch let error as APIError {
            state = .failure(error)
        } catch {
            state = .failure(.transport(error.localizedDescription))
        }
    }

    var value: Value? {
        if case .success(let value) = state {
            return value
        }
        return nil
    }
}
