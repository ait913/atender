import Foundation

enum AttendanceOptimistic {
    static func applyMarkAll(_ today: TodayResponse, status: AttendanceStatus) -> TodayResponse {
        var next = today
        next.occurrences = next.occurrences.map { occurrence in
            guard occurrence.status == nil else { return occurrence }
            var copy = occurrence
            copy.status = status
            return copy
        }
        return next
    }

    static func applyPatch(_ today: TodayResponse, occurrenceId: String, status: AttendanceStatus) -> TodayResponse {
        var next = today
        next.occurrences = next.occurrences.map { occurrence in
            guard occurrence.id == occurrenceId else { return occurrence }
            var copy = occurrence
            copy.status = status
            return copy
        }
        return next
    }
}
