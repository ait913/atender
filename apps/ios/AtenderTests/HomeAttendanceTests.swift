import Foundation
import XCTest
@testable import Atender

final class HomeAttendanceTests: XCTestCase {
    private func occurrence(
        _ id: String,
        periodIndex: Int,
        startMinute: Int,
        endMinute: Int,
        courseName: String = "講義",
        room: String? = nil,
        status: AttendanceStatus? = nil
    ) -> OccurrenceDto {
        OccurrenceDto(id: id, meetingId: "m\(id)", courseId: "c\(id)", courseName: courseName,
                      teacher: nil, room: room, color: nil, date: "2026-06-08",
                      periodIndex: periodIndex, periodOffset: 0,
                      startMinute: startMinute, endMinute: endMinute, status: status)
    }

    func testA1NoOccurrencesIsInactive() {
        XCTAssertFalse(HomeAttendance.isActive(occurrences: []), "[#A1]")
    }

    func testA2OneOccurrenceIsActive() {
        let occurrences = [
            occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630),
        ]

        XCTAssertTrue(HomeAttendance.isActive(occurrences: occurrences), "[#A2]")
    }

    func testA3AllUnrecordedOccurrencesDefaultExpanded() {
        let occurrences = [
            occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630, status: nil),
            occurrence("2", periodIndex: 2, startMinute: 640, endMinute: 730, status: nil),
            occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, status: nil),
        ]

        XCTAssertTrue(HomeAttendance.defaultExpanded(occurrences: occurrences), "[#A3]")
    }

    func testA4AllPresentOccurrencesDefaultCollapsed() {
        let occurrences = [
            occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630, status: .present),
            occurrence("2", periodIndex: 2, startMinute: 640, endMinute: 730, status: .present),
            occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, status: .present),
        ]

        XCTAssertFalse(HomeAttendance.defaultExpanded(occurrences: occurrences), "[#A4]")
    }

    func testA5MixedRecordedAndUnrecordedDefaultExpanded() {
        let occurrences = [
            occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630, status: nil),
            occurrence("2", periodIndex: 2, startMinute: 640, endMinute: 730, status: .present),
            occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, status: .absent),
        ]

        XCTAssertTrue(HomeAttendance.defaultExpanded(occurrences: occurrences), "[#A5]")
    }

    func testA6NoOccurrencesDefaultCollapsed() {
        XCTAssertFalse(HomeAttendance.defaultExpanded(occurrences: []), "[#A6]")
    }

    func testA7DownwardDragPastThresholdShouldCollapse() {
        XCTAssertTrue(
            HomeAttendance.shouldCollapse(translationHeight: 60, translationWidth: 0),
            "[#A7]"
        )
    }

    func testA8DownwardDragBelowThresholdShouldNotCollapse() {
        XCTAssertFalse(
            HomeAttendance.shouldCollapse(translationHeight: 30, translationWidth: 0),
            "[#A8]"
        )
    }

    func testA9UpwardDragShouldNotCollapse() {
        XCTAssertFalse(
            HomeAttendance.shouldCollapse(translationHeight: -60, translationWidth: 0),
            "[#A9]"
        )
    }

    func testA10HorizontalDominantDragShouldNotCollapse() {
        XCTAssertFalse(
            HomeAttendance.shouldCollapse(translationHeight: 50, translationWidth: 120),
            "[#A10]"
        )
    }
}
