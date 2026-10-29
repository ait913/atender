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
