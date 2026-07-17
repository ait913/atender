import XCTest
@testable import Atender

// Reviewer 生成: 設計 §挙動仕様 T-1 (DayConvention) を根拠に検証。
// 期待値は設計 §T-1 + §DayConvention.swift の定義から導出 (実装ボディ非参照)。
final class DayConventionTests: XCTestCase {

    private func meeting(dow: Int) -> MeetingDto {
        MeetingDto(id: "m\(dow)", courseId: "c", dayOfWeek: dow, startPeriodIndex: 1, periodCount: 1, room: nil)
    }

    func testJsToDisplay() {
        XCTAssertEqual(DayConvention.jsToDisplay(0), 7) // 日
        XCTAssertEqual(DayConvention.jsToDisplay(1), 1) // 月
        XCTAssertEqual(DayConvention.jsToDisplay(6), 6) // 土
    }

    func testDisplayToJs() {
        XCTAssertEqual(DayConvention.displayToJs(1), 1)
        XCTAssertEqual(DayConvention.displayToJs(7), 0)
    }

    func testRoundTripDisplayToJsOfJsToDisplayIsIdentity() {
        for x in 0...6 {
            XCTAssertEqual(DayConvention.displayToJs(DayConvention.jsToDisplay(x)), x, "x=\(x)")
        }
    }

    func testResolveDisplayDaysUnionAndSorted() {
        // 設計formula jsToDisplay=((js+6)%7)+1: dow=5(金)→display5, dow=0(日)→display7。
        // (設計 T-1 prose の "dow=5→display6" は doc typo。formula/Web が正)。
        // daysOfWeek=[1,3] ∪ {5,7} → [1,3,5,7]。
        let result = DayConvention.resolveDisplayDays(
            daysOfWeek: [1, 3],
            meetings: [meeting(dow: 5), meeting(dow: 0)]
        )
        XCTAssertEqual(result, [1, 3, 5, 7])
    }

    func testResolveDisplayDaysEmptyDaysDefaultsToWeekdays() {
        // 空 daysOfWeek → [1,2,3,4,5] に meeting 曜日 (dow=6=土→display6) を追加
        let result = DayConvention.resolveDisplayDays(
            daysOfWeek: [],
            meetings: [meeting(dow: 6)]
        )
        XCTAssertEqual(result, [1, 2, 3, 4, 5, 6])
    }
}
