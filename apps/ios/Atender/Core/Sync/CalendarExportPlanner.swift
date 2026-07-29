import Foundation

/// 書き出したい 1 イベント (Atender 側が正典)
struct ExportItem: Equatable, Sendable {
    let key: String
    let title: String
    let start: Date
    let end: Date
    let isAllDay: Bool
    let location: String?
    let notes: String?
}

/// EK から読んだ既存イベントの値だけを持つ (EKEvent は持ち出さない)
struct ExportedEvent: Equatable, Sendable {
    let key: String?                 // url.absoluteString。我々のものでなければ nil
    let eventIdentifier: String
    let title: String
    let start: Date
    let end: Date
    let isAllDay: Bool
    let location: String?
    let notes: String?
}

struct ExportUpdate: Equatable, Sendable {
    let item: ExportItem
    let eventIdentifier: String
}

struct ExportPlan: Equatable, Sendable {
    var creates: [ExportItem] = []
    var updates: [ExportUpdate] = []
    var deletes: [String] = []       // eventIdentifier
    var unchanged: Int = 0
    var foreign: Int = 0

    var isEmpty: Bool { creates.isEmpty && updates.isEmpty && deletes.isEmpty }
}

/// 差分エンジン (§5.4、純関数)
enum CalendarExportPlanner {
    static func plan(
        desired: [ExportItem],
        existing: [ExportedEvent],
        prunableKinds: Set<ExportKind>
    ) -> ExportPlan {
        var plan = ExportPlan()

        // 1. existing を foreign / owned に割る。owned は key ごとに eventIdentifier 昇順で 1 件だけ残す
        var ownedByKey: [String: ExportedEvent] = [:]
        var ownedOrder: [String] = []
        var duplicateDeletes: [String] = []
        for event in existing {
            guard let key = event.key, ExportKey.kind(of: key) != nil else {
                plan.foreign += 1
                continue
            }
            if let current = ownedByKey[key] {
                if event.eventIdentifier < current.eventIdentifier {
                    ownedByKey[key] = event
                    duplicateDeletes.append(current.eventIdentifier)
                } else {
                    duplicateDeletes.append(event.eventIdentifier)
                }
            } else {
                ownedByKey[key] = event
                ownedOrder.append(key)
            }
        }
        plan.deletes.append(contentsOf: duplicateDeletes)

        // 2. desired 側
        var desiredKeys = Set<String>()
        for item in desired {
            desiredKeys.insert(item.key)
            if let owned = ownedByKey[item.key] {
                if isSame(item, owned) {
                    plan.unchanged += 1
                } else {
                    plan.updates.append(ExportUpdate(item: item, eventIdentifier: owned.eventIdentifier))
                }
            } else {
                plan.creates.append(item)
            }
        }

        // 3. owned にあって desired に無いもの (prunableKinds に含まれる kind だけ消す)
        for key in ownedOrder {
            guard !desiredKeys.contains(key) else { continue }
            guard let kind = ExportKey.kind(of: key), prunableKinds.contains(kind) else { continue }
            guard let owned = ownedByKey[key] else { continue }
            plan.deletes.append(owned.eventIdentifier)
        }

        return plan
    }

    /// これが正典。ExportItem と ExportedEvent の == を使わない
    static func isSame(_ item: ExportItem, _ existing: ExportedEvent) -> Bool {
        if item.isAllDay != existing.isAllDay { return false }
        if item.title != existing.title { return false }
        if normalizedText(item.location) != normalizedText(existing.location) { return false }
        if normalizedText(item.notes) != normalizedText(existing.notes) { return false }
        if item.isAllDay {
            if SchoolClock.todayString(item.start) != SchoolClock.todayString(existing.start) { return false }
            let itemLast = item.end.addingTimeInterval(-1)
            let existingLast = existing.end.addingTimeInterval(-1)
            if SchoolClock.todayString(itemLast) != SchoolClock.todayString(existingLast) { return false }
        } else {
            if item.start.timeIntervalSince1970.rounded(.down) != existing.start.timeIntervalSince1970.rounded(.down) { return false }
            if item.end.timeIntervalSince1970.rounded(.down) != existing.end.timeIntervalSince1970.rounded(.down) { return false }
        }
        return true
    }

    /// EK は未設定の location / notes に "" を返すことがある
    static func normalizedText(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// 初回書き出し直後の read-back 検証が要るか (§4.1)
    static func shouldVerifyIdentity(plan: ExportPlan, existingOwnedCount: Int) -> Bool {
        existingOwnedCount == 0 && plan.creates.count > 0
    }
}
