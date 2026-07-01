import XCTest
@testable import Atender

final class AttendanceOptimisticTests: XCTestCase {

    func testApplyMarkAllUpdatesOnlyUnrecordedOccurrences() {
        let today = TodayResponse(date: "2026-06-08", occurrences: [
            occurrence(id: "occ_1", status: nil),
            occurrence(id: "occ_2", status: .absent),
            occurrence(id: "occ_3", status: nil),
        ])

        let updated = AttendanceOptimistic.applyMarkAll(today, status: .present)

        XCTAssertEqual(updated.occurrences.map(\.id), ["occ_1", "occ_2", "occ_3"])
        XCTAssertEqual(updated.occurrences[0].status, .present)
        XCTAssertEqual(updated.occurrences[1].status, .absent)
        XCTAssertEqual(updated.occurrences[2].status, .present)
    }

    func testApplyPatchUpdatesOnlyMatchingOccurrence() {
        let today = TodayResponse(date: "2026-06-08", occurrences: [
            occurrence(id: "occ_1", status: nil),
            occurrence(id: "occ_2", status: .absent),
            occurrence(id: "occ_3", status: .present),
        ])

        let updated = AttendanceOptimistic.applyPatch(today, occurrenceId: "occ_2", status: .excused)

        XCTAssertEqual(updated.occurrences.map(\.id), ["occ_1", "occ_2", "occ_3"])
        XCTAssertNil(updated.occurrences[0].status)
        XCTAssertEqual(updated.occurrences[1].status, .excused)
        XCTAssertEqual(updated.occurrences[2].status, .present)
    }

    func testApplyPatchWithMissingIdLeavesAllOccurrencesUnchanged() {
        let today = TodayResponse(date: "2026-06-08", occurrences: [
            occurrence(id: "occ_1", status: nil),
            occurrence(id: "occ_2", status: .absent),
        ])

        let updated = AttendanceOptimistic.applyPatch(today, occurrenceId: "missing", status: .present)

        XCTAssertEqual(updated, today)
    }

    private func occurrence(id: String, status: AttendanceStatus?) -> OccurrenceDto {
        OccurrenceDto(
            id: id,
            meetingId: "meeting_\(id)",
            courseId: "course_\(id)",
            courseName: "講義 \(id)",
            teacher: nil,
            room: nil,
            color: nil,
            date: "2026-06-08",
            periodIndex: 1,
            periodOffset: 0,
            startMinute: 540,
            endMinute: 630,
            status: status
        )
    }
}
