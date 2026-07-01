import XCTest
@testable import Atender

// Reviewer 生成: 設計 §T-6 (PeriodGrouping) を根拠に検証。
final class PeriodGroupingTests: XCTestCase {

    func testGroupPeriods() {
        let groups = PeriodGrouping.groupPeriods([1, 2, 3, 5])
        XCTAssertEqual(groups, [.init(start: 1, count: 3), .init(start: 5, count: 1)])
    }

    func testRenderPreviewContiguous() {
        XCTAssertEqual(PeriodGrouping.renderPreview([1, 2, 3]), "1-3限 (3連続)")
    }

    func testRenderPreviewSeparated() {
        XCTAssertEqual(PeriodGrouping.renderPreview([1, 3]), "1限 (単独) + 3限 (単独)")
    }

    func testIsContiguous() {
        XCTAssertTrue(PeriodGrouping.isContiguous([1, 2, 3]))
        XCTAssertFalse(PeriodGrouping.isContiguous([1, 3]))
        XCTAssertTrue(PeriodGrouping.isContiguous([2, 1])) // 重複除去+ソート後判定
    }

    func testMeetingRange() {
        let range = PeriodGrouping.meetingRange([2, 3, 4])
        XCTAssertEqual(range.startPeriodIndex, 2)
        XCTAssertEqual(range.periodCount, 3)
    }
}
