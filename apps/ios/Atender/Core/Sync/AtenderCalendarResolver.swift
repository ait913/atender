import Foundation

/// EKSource.sourceType の写像 (EventKit を import しないための値型)
enum EKSourceKind: String, Equatable, Sendable {
    case local, exchange, calDAV, mobileMe, subscribed, birthdays, other
}

struct EKSourceSnapshot: Equatable, Sendable {
    let id: String
    let title: String
    let kind: EKSourceKind
}

struct EKCalendarSnapshot: Equatable, Sendable, Identifiable {
    let id: String
    let title: String
    let sourceId: String
    let sourceTitle: String
    let colorHex: String?
    let allowsModify: Bool
    /// allowedEntityTypes に .event を含むか
    let allowsEvents: Bool
}

enum CalendarResolution: Equatable, Sendable {
    case use(String)                        // calendarIdentifier
    case createNew(sourceId: String)
    case unavailable(CalendarSyncError)
}

/// 専用「Atender」カレンダーの解決 (§5.1、純関数)
enum AtenderCalendarResolver {
    static func resolve(
        storedId: String?,
        calendars: [EKCalendarSnapshot],
        sources: [EKSourceSnapshot],
        defaultCalendarSourceId: String?,
        allowCreate: Bool
    ) -> CalendarResolution {
        // 1. カレンダーが 1 件も見えない = ソース未ロードの過渡状態。ここで作ってはいけない
        guard !calendars.isEmpty else { return .unavailable(.calendarLookupTransient) }

        // 2. 保存済み id が生きていればそれ
        if let storedId,
           let stored = calendars.first(where: { $0.id == storedId }),
           stored.allowsEvents, stored.allowsModify {
            return .use(stored.id)
        }

        // 3. title 完全一致で救う (大小区別あり・trim しない)
        let named = calendars.filter { $0.title == AtenderCalendarSpec.title && $0.allowsEvents && $0.allowsModify }
        if !named.isEmpty {
            if let defaultCalendarSourceId,
               let preferred = named.filter({ $0.sourceId == defaultCalendarSourceId }).min(by: { $0.id < $1.id }) {
                return .use(preferred.id)
            }
            if let first = named.min(by: { $0.id < $1.id }) {
                return .use(first.id)
            }
        }

        // 4. 作成が許されていない (設定 UI の一覧構築 / 読み込みパス)
        guard allowCreate else { return .unavailable(.calendarLookupTransient) }

        // 5. 書き込めるソースが無い
        guard let sourceId = writableSourceId(sources: sources, defaultCalendarSourceId: defaultCalendarSourceId) else {
            return .unavailable(.noWritableSource)
        }

        // 6. 作る
        return .createNew(sourceId: sourceId)
    }

    static func writableSourceId(
        sources: [EKSourceSnapshot],
        defaultCalendarSourceId: String?
    ) -> String? {
        if let defaultCalendarSourceId,
           let source = sources.first(where: { $0.id == defaultCalendarSourceId }),
           source.kind != .subscribed, source.kind != .birthdays {
            return source.id
        }
        for kind in [EKSourceKind.calDAV, .mobileMe, .local] {
            if let source = sources.filter({ $0.kind == kind }).min(by: { $0.id < $1.id }) {
                return source.id
            }
        }
        return nil
    }
}
