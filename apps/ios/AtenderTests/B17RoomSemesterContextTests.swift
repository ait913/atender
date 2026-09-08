import XCTest
@testable import Atender

/// build 17 設計 §6.7 (#B56-#B60) — ルーム時間割の学期文脈。
/// 設計docのみを根拠に記述 (実装は未読)。
final class B17RoomSemesterContextTests: XCTestCase {

    private func slot(_ periodIndex: Int, label: String) -> DaySlotDto {
        DaySlotDto(periodIndex: periodIndex, label: label, startMinute: 540 + periodIndex * 60,
                   endMinute: 590 + periodIndex * 60, isBreak: false)
    }

    private func timetable(_ semesterId: String) -> UserTimetableDto {
        UserTimetableDto(id: "tt-\(semesterId)",
                         userId: "u1",
                         semesterId: semesterId,
                         title: "時間割 \(semesterId)",
                         sourceTemplateId: nil,
                         daysOfWeek: [1, 2, 3, 4, 5],
                         daySlots: [slot(1, label: semesterId)],
                         courses: [],
                         meetings: [],
                         createdAt: "2026-01-01T00:00:00.000Z",
                         updatedAt: "2026-01-01T00:00:00.000Z")
    }

    /// [#B56] UI で選ばれた学期が既定学期より優先される
    func testB56PreferredSemesterWins() {
        let slots = RoomTimetableLogic.resolveDaySlots(preferredSemesterId: "s2",
                                                       defaultSemesterId: "s1",
                                                       timetables: [timetable("s1"), timetable("s2")])
        XCTAssertEqual(slots.first?.label, "s2", "[#B56] preferredSemesterId が最優先になっていない")
    }

    /// [#B57] preferred が存在しなければ既定学期へフォールバック
    func testB57FallsBackToDefaultSemester() {
        let slots = RoomTimetableLogic.resolveDaySlots(preferredSemesterId: "s9",
                                                       defaultSemesterId: "s1",
                                                       timetables: [timetable("s1"), timetable("s2")])
        XCTAssertEqual(slots.first?.label, "s1", "[#B57] 存在しない preferred で既定学期へ落ちない")
    }

    /// [#B58] 第 1 引数を省略した既存呼び出しは従来どおり
    func testB58LegacyCallSiteStillCompiles() {
        let slots = RoomTimetableLogic.resolveDaySlots(defaultSemesterId: "s1", timetables: [timetable("s1")])
        XCTAssertEqual(slots.first?.label, "s1", "[#B58] 既存呼び出しの挙動が変わった")
    }

    /// [#B59] 何も無ければ defaultSlots
    func testB59FallsBackToDefaultSlots() {
        let slots = RoomTimetableLogic.resolveDaySlots(preferredSemesterId: nil,
                                                       defaultSemesterId: nil,
                                                       timetables: [])
        XCTAssertEqual(slots.map(\.periodIndex), RoomTimetableLogic.defaultSlots.map(\.periodIndex),
                       "[#B59] defaultSlots にフォールバックしない")
        XCTAssertFalse(slots.isEmpty, "[#B59] defaultSlots が空")
    }

    /// [#B59 補] preferred も default も無いが時間割が 1 個ある → 先頭を採る (§4.8 優先順 3)
    func testB59bFallsBackToFirstTimetable() {
        let slots = RoomTimetableLogic.resolveDaySlots(preferredSemesterId: nil,
                                                       defaultSemesterId: nil,
                                                       timetables: [timetable("sX")])
        XCTAssertEqual(slots.first?.label, "sX", "[#B59] 先頭の時間割へ落ちない")
    }

    /// [#B60] Endpoints.roomWeek の query は additive
    func testB60RoomWeekQueryIsAdditive() {
        let withSemester = Endpoints.roomWeek(id: "r1", weekStart: "2026-07-27", semesterId: "s2")
        let withoutSemester = Endpoints.roomWeek(id: "r1", weekStart: "2026-07-27", semesterId: nil)
        let omitted = Endpoints.roomWeek(id: "r1", weekStart: "2026-07-27")

        XCTAssertEqual(withSemester.path, "/api/rooms/r1/week", "[#B60] path が違う")
        let keys = Set(withSemester.query.keys)
        XCTAssertEqual(keys, ["weekStart", "semesterId"], "[#B60] query キーが weekStart + semesterId でない (実測 \(keys))")
        XCTAssertEqual(withSemester.query["weekStart"], "2026-07-27", "[#B60] weekStart の値が違う")
        XCTAssertEqual(withSemester.query["semesterId"], "s2", "[#B60] semesterId の値が違う")

        let nilKeys = Set(withoutSemester.query.keys)
        XCTAssertEqual(nilKeys, ["weekStart"], "[#B60] semesterId: nil でキーが落ちていない (実測 \(nilKeys))")
        let omittedKeys = Set(omitted.query.keys)
        XCTAssertEqual(omittedKeys, ["weekStart"], "[#B60] 省略呼び出しでキーが落ちていない (実測 \(omittedKeys))")
    }
}
