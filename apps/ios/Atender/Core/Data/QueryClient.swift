import Foundation
import Observation

@MainActor
@Observable
final class QueryClient {
    struct CacheEntry {
        var value: Any
        var isStale: Bool
        var updatedAt: Date
    }

    private var entries: [QueryKey: CacheEntry] = [:]

    func data<T>(for key: QueryKey, as type: T.Type) -> T? {
        entries[key]?.value as? T
    }

    func setData<T>(_ value: T, for key: QueryKey) {
        entries[key] = .init(value: value, isStale: false, updatedAt: .now)
    }

    func keys(matching prefix: QueryKey) -> [QueryKey] {
        entries.keys.filter { $0.hasPrefix(prefix) }
    }

    func invalidate(prefix: QueryKey) {
        for key in keys(matching: prefix) {
            entries[key]?.isStale = true
        }
    }

    func invalidate(prefixes: [QueryKey]) {
        prefixes.forEach { invalidate(prefix: $0) }
    }

    func isStale(_ key: QueryKey) -> Bool {
        entries[key]?.isStale ?? true
    }

    func snapshot<T>(matching prefix: QueryKey, as type: T.Type) -> [(QueryKey, T)] {
        keys(matching: prefix).compactMap { key in
            (entries[key]?.value as? T).map { (key, $0) }
        }
    }

    func restore<T>(_ snapshot: [(QueryKey, T)]) {
        for (key, value) in snapshot {
            setData(value, for: key)
        }
    }

    func removeAll() {
        entries.removeAll()
    }
}
