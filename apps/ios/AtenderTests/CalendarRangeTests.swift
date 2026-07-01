import XCTest
@testable import Atender

// Reviewer 生成: 設計 §T-4 (CalendarRange) を根拠に検証。
final class CalendarRangeTests: XCTestCase {

    func testMondayOfWednesday() {
        // 2026-06-24 (水) → 2026-06-22 (月)
        XCTAssertEqual(CalendarRange.mondayOf("2026-06-24"), "2026-06-22")
    }

    func testMondayOfSundayGoesBack6Days() {
        // 2026-06-28 (日) → 2026-06-22 (月)
        XCTAssertEqual(CalendarRange.mondayOf("2026-06-28"), "2026-06-22")
    }

    func testMondayOfMondayIsIdentity() {
        XCTAssertEqual(CalendarRange.mondayOf("2026-06-22"), "2026-06-22")
    }

    func testMonthGridRangeIs42DaysFromMondayOfMonthFirst() {
        let range = CalendarRange.monthGridRange(anchorMonthFirst: "2026-06-01")
        XCTAssertEqual(range.start, "2026-06-01")            // mondayOf(6/1); 6/1 は月曜
        XCTAssertEqual(range.end, "2026-07-12")              // start + 41 日
        // 42 日ちょうど
        XCTAssertEqual(CalendarRange.addDays(range.start, 41), range.end)
    }

    func testWeekStartsForMonthHas6Elements() {
        let starts = CalendarRange.weekStartsFor(.month, anchor: "2026-06-01")
        XCTAssertEqual(starts.count, 6)
        XCTAssertEqual(starts.first, "2026-06-01")
        XCTAssertEqual(starts.last, "2026-07-06")  // 06-01 + 5週
    }

    func testWeekStartsForWeekAndDayIsMondayOfAnchor() {
        XCTAssertEqual(CalendarRange.weekStartsFor(.week, anchor: "2026-06-24"), ["2026-06-22"])
        XCTAssertEqual(CalendarRange.weekStartsFor(.day, anchor: "2026-06-24"), ["2026-06-22"])
    }

    func testAddDaysAcrossMonthBoundary() {
        XCTAssertEqual(CalendarRange.addDays("2026-06-30", 1), "2026-07-01")
    }

    func testAddDaysAcrossYearBoundary() {
        XCTAssertEqual(CalendarRange.addDays("2026-12-31", 1), "2027-01-01")
    }

    func testFormatMonthDay() {
        XCTAssertEqual(CalendarRange.format("2026-06-05", .monthDay), "6/5")
    }
}
