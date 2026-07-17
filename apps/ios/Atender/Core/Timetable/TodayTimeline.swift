import Foundation

enum TodayState: Equatable {
    /// No occurrences today.
    case noClass
    /// Before class or between classes. The user-facing answer is the next class.
    case upcoming(next: OccurrenceDto)
    /// A class is currently in progress. next is nil for the final class.
    case inClass(current: OccurrenceDto, next: OccurrenceDto?)
    /// All classes for today have finished.
    case finished(last: OccurrenceDto)
}

enum TodayTimeline {
    static func state(occurrences: [OccurrenceDto], nowMinute: Int) -> TodayState {
        let sorted = occurrences.sorted {
            if $0.startMinute != $1.startMinute { return $0.startMinute < $1.startMinute }
            if $0.endMinute != $1.endMinute { return $0.endMinute < $1.endMinute }
            return $0.id < $1.id
        }

        guard !sorted.isEmpty else { return .noClass }

        let current = sorted.first {
            $0.startMinute <= nowMinute && nowMinute < $0.endMinute
        }
        let next = sorted.first { $0.startMinute > nowMinute }

        if let current {
            return .inClass(current: current, next: next)
        }
        if let next {
            return .upcoming(next: next)
        }

        let last = sorted.max {
            if $0.endMinute != $1.endMinute { return $0.endMinute < $1.endMinute }
            if $0.startMinute != $1.startMinute { return $0.startMinute < $1.startMinute }
            return $0.id < $1.id
        }
        return .finished(last: last ?? sorted[sorted.count - 1])
    }

    /// Detects an open app crossing midnight. nil means data has not been loaded yet.
    static func isStale(loadedDate: String?, now: Date = Date()) -> Bool {
        loadedDate == nil || SchoolClock.todayString(now) != loadedDate!
    }
}

enum NowNextText {
    static func statusLabel(_ state: TodayState) -> String? {
        switch state {
        case .noClass: return nil
        case .upcoming: return "次の授業"
        case .inClass: return "授業中"
        case .finished: return "本日終了"
        }
    }

    static func title(_ state: TodayState) -> String? {
        switch state {
        case .noClass:
            return nil
        case .upcoming(let next):
            return "\(next.periodIndex)限 \(next.courseName)"
        case .inClass(let current, _):
            return "\(current.periodIndex)限 \(current.courseName)"
        case .finished:
            return "今日の授業は終わりました"
        }
    }

    static func detail(_ state: TodayState) -> String? {
        switch state {
        case .noClass, .finished:
            return nil
        case .upcoming(let next):
            return joinDetail(time: TimeFormatting.minutesToTime(next.startMinute), room: next.room)
        case .inClass(let current, _):
            let time = "\(TimeFormatting.minutesToTime(current.startMinute))–\(TimeFormatting.minutesToTime(current.endMinute))"
            return joinDetail(time: time, room: current.room)
        }
    }

    private static func joinDetail(time: String?, room: String?) -> String? {
        let parts = [time, room]
            .compactMap { value -> String? in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

enum AttendanceSummary {
    static func unrecordedCount(_ occurrences: [OccurrenceDto]) -> Int {
        occurrences.filter { $0.status == nil }.count
    }
}
