import XCTest
@testable import Atender

// Reviewer 生成: 設計 §T-2 (TimetableCoalesce.coalesce) を根拠に検証。
final class TimetableCoalesceTests: XCTestCase {

    private func ev(_ id: String, day: Int, start: Int, count: Int = 1,
                    key: String? = "k", color: String = "#111111",
                    title: String = "t") -> TimetableEventInput {
        TimetableEventInput(id: id, dayOfWeek: day, startPeriodIndex: start,
                            periodCount: count, color: color, title: title,
                            subtitle: nil, mergeKey: key)
    }

    func testAdjacentSameMergeKeyMerges() {
        // 月1限 + 月2限 同 mergeKey → 1件 periodCount=2, id=先頭
        let out = TimetableCoalesce.coalesce([
            ev("a", day: 1, start: 1, key: "k"),
            ev("b", day: 1, start: 2, key: "k"),
        ])
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].id, "a")
        XCTAssertEqual(out[0].periodCount, 2)
        XCTAssertEqual(out[0].startPeriodIndex, 1)
    }

    func testNonAdjacentDoesNotMerge() {
        // 月1限 + 月3限 → 2件据置
        let out = TimetableCoalesce.coalesce([
            ev("a", day: 1, start: 1, key: "k"),
            ev("b", day: 1, start: 3, key: "k"),
        ])
        XCTAssertEqual(out.count, 2)
        XCTAssertEqual(out.map(\.startPeriodIndex), [1, 3])
    }

    func testDifferentDayDoesNotMerge() {
        // 月1 + 火1 同 mergeKey → 結合しない
        let out = TimetableCoalesce.coalesce([
            ev("a", day: 1, start: 1, key: "k"),
            ev("b", day: 2, start: 1, key: "k"),
        ])
        XCTAssertEqual(out.count, 2)
        XCTAssertEqual(out.map(\.dayOfWeek), [1, 2])
    }

    func testNilMergeKeyPassThroughInInputOrder() {
        // mergeKey nil 2件 → 素通し、順序=入力 order 反映 (同 day/start)
        let out = TimetableCoalesce.coalesce([
            ev("a", day: 1, start: 1, key: nil),
            ev("b", day: 1, start: 1, key: nil),
        ])
        XCTAssertEqual(out.count, 2)
        XCTAssertEqual(out.map(\.id), ["a", "b"])
    }

    func testThreeConsecutiveMerge() {
        let out = TimetableCoalesce.coalesce([
            ev("a", day: 1, start: 1, key: "k"),
            ev("b", day: 1, start: 2, key: "k"),
            ev("c", day: 1, start: 3, key: "k"),
        ])
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].periodCount, 3)
        XCTAssertEqual(out[0].id, "a")
    }

    func testOutputStableSortDayThenStartThenOrder() {
        // 入力順シャッフル → (dayOfWeek asc, startPeriodIndex asc) 昇順出力
        let out = TimetableCoalesce.coalesce([
            ev("z", day: 2, start: 1, key: "z"),
            ev("y", day: 1, start: 3, key: "y"),
            ev("x", day: 1, start: 1, key: "x"),
        ])
        XCTAssertEqual(out.map { "\($0.dayOfWeek):\($0.startPeriodIndex)" },
                       ["1:1", "1:3", "2:1"])
        XCTAssertEqual(out.map(\.id), ["x", "y", "z"])
    }

    func testIdColorTitlePreservedFromFirst() {
        let out = TimetableCoalesce.coalesce([
            ev("first", day: 1, start: 1, key: "k", color: "#AAAAAA", title: "First"),
            ev("second", day: 1, start: 2, key: "k", color: "#BBBBBB", title: "Second"),
        ])
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].id, "first")
        XCTAssertEqual(out[0].color, "#AAAAAA")
        XCTAssertEqual(out[0].title, "First")
    }
}
