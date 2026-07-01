import SwiftUI
import XCTest
@testable import Atender

final class SemesterOverviewDisplayLogicTests: XCTestCase {

    func testPct() {
        XCTAssertNil(SemesterOverviewDisplayLogic.pct(rate: nil))
        XCTAssertEqual(SemesterOverviewDisplayLogic.pct(rate: 0.95), 95)
        XCTAssertEqual(SemesterOverviewDisplayLogic.pct(rate: 0.8888888889), 89)
        XCTAssertEqual(SemesterOverviewDisplayLogic.pct(rate: 0.8947368421), 89)
    }

    func testColorForRate() {
        XCTAssertEqual(Color.forRate(pct: nil, required: 80), .textTertiary)
        XCTAssertEqual(Color.forRate(pct: 80, required: 80), .accent)
        XCTAssertEqual(Color.forRate(pct: 79, required: 80), .statusAbsent)
        XCTAssertEqual(Color.forRate(pct: 100, required: 80), .accent)
    }

    func testOverallActionText() {
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.overallActionText(
                allowedAbsences: nil,
                remainingCount: 10,
                required: 80
            ),
            "データなし"
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.overallActionText(
                allowedAbsences: -1,
                remainingCount: 10,
                required: 80
            ),
            "80% を下回る見込み"
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.overallActionText(
                allowedAbsences: 5,
                remainingCount: 5,
                required: 80
            ),
            "残りを全部休んでも 80% を維持"
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.overallActionText(
                allowedAbsences: 2,
                remainingCount: 10,
                required: 80
            ),
            "あと 2限 休める"
        )
    }

    func testCourseActionText() {
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.courseActionText(
                allowedAbsences: nil,
                remainingCount: 10,
                allowedAbsenceDays: 2
            ),
            "—"
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.courseActionText(
                allowedAbsences: -1,
                remainingCount: 10,
                allowedAbsenceDays: nil
            ),
            "下回る見込み"
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.courseActionText(
                allowedAbsences: 5,
                remainingCount: 5,
                allowedAbsenceDays: nil
            ),
            "残り全休OK"
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.courseActionText(
                allowedAbsences: 4,
                remainingCount: 10,
                allowedAbsenceDays: nil
            ),
            "あと4限休める"
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.courseActionText(
                allowedAbsences: 4,
                remainingCount: 10,
                allowedAbsenceDays: 2
            ),
            "あと4限 (2日) 休める"
        )
    }

    func testActionColor() {
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.actionColor(allowedAbsences: nil, remainingCount: 10),
            .textTertiary
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.actionColor(allowedAbsences: -1, remainingCount: 10),
            .statusAbsent
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.actionColor(allowedAbsences: 5, remainingCount: 5),
            .accent
        )
    }
}
