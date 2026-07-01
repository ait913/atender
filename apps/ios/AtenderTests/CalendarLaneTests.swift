import XCTest
@testable import Atender

// Reviewer 生成: 設計 §T-5 (CalendarLane.assignLanes) を根拠に検証。
final class CalendarLaneTests: XCTestCase {

    private func event(_ id: String, _ start: Int, _ end: Int) -> CalendarEvent {
        CalendarEvent(kind: .personal, id: id, date: "2026-06-22", title: id,
                      startMinute: start, endMinute: end, color: "#111111",
                      subtitle: "自分", courseId: nil)
    }

    private func laned(_ result: [CalendarLane.Laned], _ id: String) -> CalendarLane.Laned? {
        result.first { $0.event.id == id }
    }

    func testTwoNonOverlappingBothLaneZero() {
        let out = CalendarLane.assignLanes([event("a", 540, 600), event("b", 660, 720)])
        XCTAssertEqual(out.count, 2)
        XCTAssertEqual(laned(out, "a")?.lane, 0)
        XCTAssertEqual(laned(out, "b")?.lane, 0)
        XCTAssertEqual(laned(out, "a")?.laneCount, 1)
        XCTAssertEqual(laned(out, "b")?.laneCount, 1)
    }

    func testFullOverlapTwoLanes() {
        let out = CalendarLane.assignLanes([event("a", 540, 660), event("b", 540, 660)])
        XCTAssertEqual(out.count, 2)
        XCTAssertEqual(Set([laned(out, "a")!.lane, laned(out, "b")!.lane]), [0, 1])
        XCTAssertEqual(laned(out, "a")?.laneCount, 2)
        XCTAssertEqual(laned(out, "b")?.laneCount, 2)
    }

    func testPartialOverlapGreedyReusesFreedLane() {
        // a[540,600] b[560,620] c[610,700]: b は a と重なり lane1、c は a 解放後 lane0 再利用
        let out = CalendarLane.assignLanes([event("a", 540, 600), event("b", 560, 620), event("c", 610, 700)])
        XCTAssertEqual(out.count, 3)
        XCTAssertEqual(laned(out, "a")?.lane, 0)
        XCTAssertEqual(laned(out, "b")?.lane, 1)
        XCTAssertEqual(laned(out, "c")?.lane, 0)
        // 同一クラスタなので laneCount=2 で共有
        XCTAssertEqual(laned(out, "a")?.laneCount, 2)
        XCTAssertEqual(laned(out, "b")?.laneCount, 2)
        XCTAssertEqual(laned(out, "c")?.laneCount, 2)
    }

    func testZeroOrNegativeDurationExcluded() {
        let out = CalendarLane.assignLanes([event("valid", 540, 600), event("zero", 600, 600)])
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out.first?.event.id, "valid")
    }
}
