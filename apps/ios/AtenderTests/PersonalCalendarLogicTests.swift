import XCTest
@testable import Atender

// Reviewer 生成: 設計doc §6.2 (B2 修正) / §9 U6 を根拠に検証。実装コードは未読。
final class PersonalCalendarLogicTests: XCTestCase {

    func testU6SameMonthDoesNotRequireReload() {
        XCTAssertFalse(PersonalCalendarLogic.monthChanged(anchor: "2026-07-15", date: "2026-07-31"), "[#U6]")
        XCTAssertFalse(PersonalCalendarLogic.monthChanged(anchor: "2026-07-15", date: "2026-07-01"), "[#U6]")
        XCTAssertFalse(PersonalCalendarLogic.monthChanged(anchor: "2026-07-15", date: "2026-07-15"), "[#U6]")
    }

    func testU6NextMonthRequiresReload() {
        XCTAssertTrue(PersonalCalendarLogic.monthChanged(anchor: "2026-07-15", date: "2026-08-01"), "[#U6]")
    }

    func testU6PreviousMonthRequiresReload() {
        XCTAssertTrue(PersonalCalendarLogic.monthChanged(anchor: "2026-07-15", date: "2026-06-30"), "[#U6]")
    }

    func testU6YearBoundary() {
        XCTAssertTrue(PersonalCalendarLogic.monthChanged(anchor: "2026-12-31", date: "2027-01-01"), "[#U6]")
        XCTAssertFalse(PersonalCalendarLogic.monthChanged(anchor: "2026-12-01", date: "2026-12-31"), "[#U6]")
    }
}
