import XCTest
@testable import Atender

final class TodayTimelineTests: XCTestCase {

    private func jst(_ s: String) -> Date {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }

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

    private var standardOccurrences: [OccurrenceDto] {
        [
            occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630),
            occurrence("2", periodIndex: 2, startMinute: 640, endMinute: 730),
            occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870),
        ]
    }

    func testN1NoOccurrencesReturnsNoClass() {
        XCTAssertEqual(TodayTimeline.state(occurrences: [], nowMinute: 480), .noClass, "[ui-revamp #N1]")
    }

    func testN2BeforeFirstClassReturnsUpcomingFirst() {
        guard case let .upcoming(next) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 480) else {
            return XCTFail("[ui-revamp #N2]")
        }
        XCTAssertEqual(next.id, "1", "[ui-revamp #N2]")
    }

    func testN3StartBoundaryIsInClass() {
        guard case let .inClass(current, next) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 540) else {
            return XCTFail("[ui-revamp #N3]")
        }
        XCTAssertEqual(current.id, "1", "[ui-revamp #N3]")
        XCTAssertEqual(next?.id, "2", "[ui-revamp #N3]")
    }

    func testN4DuringClassReturnsCurrentAndNext() {
        guard case let .inClass(current, next) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 600) else {
            return XCTFail("[ui-revamp #N4]")
        }
        XCTAssertEqual(current.id, "1", "[ui-revamp #N4]")
        XCTAssertEqual(next?.id, "2", "[ui-revamp #N4]")
    }

    func testN5EndBoundaryIsUpcomingNextClass() {
        guard case let .upcoming(next) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 630) else {
            return XCTFail("[ui-revamp #N5]")
        }
        XCTAssertEqual(next.id, "2", "[ui-revamp #N5]")
    }

    func testN6BreakBetweenFirstAndSecondReturnsUpcomingSecond() {
        guard case let .upcoming(next) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 635) else {
            return XCTFail("[ui-revamp #N6]")
        }
        XCTAssertEqual(next.id, "2", "[ui-revamp #N6]")
    }

    func testN7BreakBetweenSecondAndThirdReturnsUpcomingThird() {
        guard case let .upcoming(next) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 735) else {
            return XCTFail("[ui-revamp #N7]")
        }
        XCTAssertEqual(next.id, "3", "[ui-revamp #N7]")
    }

    func testN8FinalClassHasNoNext() {
        guard case let .inClass(current, next) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 800) else {
            return XCTFail("[ui-revamp #N8]")
        }
        XCTAssertEqual(current.id, "3", "[ui-revamp #N8]")
        XCTAssertNil(next, "[ui-revamp #N8]")
    }

    func testN9FinalEndBoundaryReturnsFinished() {
        guard case let .finished(last) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 870) else {
            return XCTFail("[ui-revamp #N9]")
        }
        XCTAssertEqual(last.id, "3", "[ui-revamp #N9]")
    }

    func testN10AfterAllClassesReturnsFinished() {
        guard case let .finished(last) = TodayTimeline.state(occurrences: standardOccurrences, nowMinute: 1400) else {
            return XCTFail("[ui-revamp #N10]")
        }
        XCTAssertEqual(last.id, "3", "[ui-revamp #N10]")
    }

    func testN11InputOrderDoesNotAffectTimeline() {
        let shuffled = [standardOccurrences[2], standardOccurrences[0], standardOccurrences[1]]

        guard case let .upcoming(beforeFirst) = TodayTimeline.state(occurrences: shuffled, nowMinute: 480) else {
            return XCTFail("[ui-revamp #N11]")
        }
        XCTAssertEqual(beforeFirst.id, "1", "[ui-revamp #N11]")

        guard case let .inClass(current, next) = TodayTimeline.state(occurrences: shuffled, nowMinute: 600) else {
            return XCTFail("[ui-revamp #N11]")
        }
        XCTAssertEqual(current.id, "1", "[ui-revamp #N11]")
        XCTAssertEqual(next?.id, "2", "[ui-revamp #N11]")

        guard case let .finished(last) = TodayTimeline.state(occurrences: shuffled, nowMinute: 1400) else {
            return XCTFail("[ui-revamp #N11]")
        }
        XCTAssertEqual(last.id, "3", "[ui-revamp #N11]")
    }

    func testN12SingleOccurrenceCoversAllStates() {
        let one = [occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630)]

        guard case .upcoming = TodayTimeline.state(occurrences: one, nowMinute: 400) else {
            return XCTFail("[ui-revamp #N12]")
        }
        guard case let .inClass(current, next) = TodayTimeline.state(occurrences: one, nowMinute: 600) else {
            return XCTFail("[ui-revamp #N12]")
        }
        XCTAssertEqual(current.id, "1", "[ui-revamp #N12]")
        XCTAssertNil(next, "[ui-revamp #N12]")
        guard case let .finished(last) = TodayTimeline.state(occurrences: one, nowMinute: 700) else {
            return XCTFail("[ui-revamp #N12]")
        }
        XCTAssertEqual(last.id, "1", "[ui-revamp #N12]")
    }

    func testN13OverlappingCurrentUsesSortedFirst() {
        let occurrences = [
            occurrence("b", periodIndex: 2, startMinute: 540, endMinute: 730),
            occurrence("a", periodIndex: 1, startMinute: 540, endMinute: 630),
        ]

        guard case let .inClass(current, _) = TodayTimeline.state(occurrences: occurrences, nowMinute: 600) else {
            return XCTFail("[ui-revamp #N13]")
        }
        XCTAssertEqual(current.id, "a", "[ui-revamp #N13]")
    }

    func testN14NilLoadedDateIsStale() {
        XCTAssertTrue(TodayTimeline.isStale(loadedDate: nil, now: jst("2026-07-17 12:00")), "[ui-revamp #N14]")
    }

    func testN15SameJSTDateAtEightAMIsNotStale() {
        XCTAssertFalse(TodayTimeline.isStale(loadedDate: "2026-07-17", now: jst("2026-07-17 08:00")), "[ui-revamp #N15]")
    }

    func testN16NextJSTDateIsStale() {
        XCTAssertTrue(TodayTimeline.isStale(loadedDate: "2026-07-17", now: jst("2026-07-18 00:00")), "[ui-revamp #N16]")
    }

    func testN17UnrecordedCountCountsNilStatusesOnly() {
        XCTAssertEqual(AttendanceSummary.unrecordedCount([]), 0, "[ui-revamp #N17]")
        XCTAssertEqual(AttendanceSummary.unrecordedCount([
            occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630, status: nil),
            occurrence("2", periodIndex: 2, startMinute: 640, endMinute: 730, status: .absent),
            occurrence("3", periodIndex: 3, startMinute: 780, endMinute: 870, status: nil),
        ]), 2, "[ui-revamp #N17]")
        XCTAssertEqual(AttendanceSummary.unrecordedCount([
            occurrence("1", periodIndex: 1, startMinute: 540, endMinute: 630, status: .excused),
            occurrence("2", periodIndex: 2, startMinute: 640, endMinute: 730, status: .tardy),
        ]), 0, "[ui-revamp #N17]")
    }
}
