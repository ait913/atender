import Foundation
import XCTest
@testable import Atender

/// build 17 設計 §7.1「ルーム側だけが持っていた機能 (7 件)」の独立検証 (ユニット層) +
/// §8 のファイル配置。設計docのみを根拠に記述 (実装は未読)。
final class B17RoomFeatureParityTests: XCTestCase {

    private func repoRoot() -> URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<2 { url.deleteLastPathComponent() }   // <file> -> AtenderTests -> ios
        return url
    }

    private func member(_ userId: String, name: String?, color: String) -> RoomWeekDto.Member {
        RoomWeekDto.Member(userId: userId, name: name, handle: nil, image: nil, color: color)
    }

    private func week(members: [RoomWeekDto.Member], meetings: [RoomWeekDto.Meeting], events: [RoomEventDto]) -> RoomWeekDto {
        RoomWeekDto(weekStart: "2026-07-27", weekEnd: "2026-08-02",
                    members: members, meetings: meetings, recurringMeetings: [], roomEvents: events)
    }

    private func meeting(userId: String, courseName: String, color: String?, date: String) -> RoomWeekDto.Meeting {
        RoomWeekDto.Meeting(userId: userId, occurrenceId: "occ-\(userId)-\(date)", courseId: "c1",
                            courseName: courseName, courseColor: color, date: date,
                            startMinute: 540, endMinute: 630)
    }

    /// [#F3 / §7.1 #3] メンバー色分け + 名前 subtitle がルーム loader の生成物に載る
    func testF3MemberColorAndNameSubtitleSurvive() {
        let alice = member("u-alice", name: "アリス", color: "hsl(10, 70%, 45%)")
        let bob = member("u-bob", name: "ボブ", color: "hsl(200, 70%, 45%)")
        let weeks = [week(members: [alice, bob],
                          meetings: [meeting(userId: "u-alice", courseName: "数学", color: "#123456", date: "2026-07-27"),
                                     meeting(userId: "u-bob", courseName: "英語", color: nil, date: "2026-07-28")],
                          events: [])]
        let events = RoomCalendarLogic.buildCalendarEvents(weeks: weeks)
        XCTAssertGreaterThanOrEqual(events.count, 2, "[#F3] メンバーの授業が CalendarEvent 化されていない")

        let aliceEvent = events.first { $0.ownerId == "u-alice" } ?? events.first { $0.subtitle.contains("アリス") }
        let bobEvent = events.first { $0.ownerId == "u-bob" } ?? events.first { $0.subtitle.contains("ボブ") }
        let unwrappedAlice = try? XCTUnwrap(aliceEvent)
        XCTAssertNotNil(unwrappedAlice, "[#F3] アリスの予定が無い")
        XCTAssertNotNil(bobEvent, "[#F3] ボブの予定が無い")

        if let aliceEvent {
            XCTAssertTrue(aliceEvent.subtitle.contains("アリス"),
                          "[#F3] subtitle にメンバー名が入っていない (実測 \"\(aliceEvent.subtitle)\")")
            XCTAssertFalse(aliceEvent.color.isEmpty, "[#F3] color が空 (メンバー色分けが失われた)")
        }
        if let bobEvent {
            XCTAssertTrue(bobEvent.subtitle.contains("ボブ"),
                          "[#F3] subtitle にメンバー名が入っていない (実測 \"\(bobEvent.subtitle)\")")
        }
        // 別メンバーは別の色になる (色分けが機能している)
        if let aliceEvent, let bobEvent {
            XCTAssertNotEqual(aliceEvent.color, bobEvent.color, "[#F3] メンバーごとの色分けが消えている")
        }
    }

    /// [#F3b] ルーム予定 (RoomEvent) も CalendarEvent に載る (§7.1 #2 の表示側)
    func testF3bRoomEventsBecomeCalendarEvents() {
        let event = RoomEventDto(id: "re1", seriesId: "s1", roomId: "r1", authorId: "u-alice",
                                 title: "合同勉強会", rawTitle: nil, description: nil,
                                 start: "2026-07-27T01:00:00.000Z", end: "2026-07-27T03:00:00.000Z",
                                 isAllDay: false, color: "#FF8800", source: .manual, visibilityMode: .normal,
                                 isRecurringOccurrence: false, recurrenceRule: nil,
                                 occurrenceDate: "2026-07-27", overrideId: nil,
                                 googleSyncId: nil, googleEventId: nil, googleRecurringEventId: nil,
                                 createdAt: "2026-07-01T00:00:00.000Z")
        let weeks = [week(members: [member("u-alice", name: "アリス", color: "hsl(10, 70%, 45%)")],
                          meetings: [], events: [event])]
        let events = RoomCalendarLogic.buildCalendarEvents(weeks: weeks)
        XCTAssertTrue(events.contains { $0.title == "合同勉強会" }, "[#F3b] ルーム予定がカレンダーに出ない")
    }

    /// [#F0 / §5.2] 共有比較子 CalendarEventOrder は date → startMinute → id の昇順
    func testF0SharedEventOrder() {
        func makeEvent(_ id: String, _ date: String, _ start: Int) -> CalendarEvent {
            CalendarEvent(kind: .personal, id: id, date: date, title: id, startMinute: start,
                          endMinute: start + 60, color: "#123456", subtitle: "", courseId: nil)
        }
        let unsorted = [makeEvent("c", "2026-07-02", 540),
                        makeEvent("b", "2026-07-01", 600),
                        makeEvent("a", "2026-07-01", 600),
                        makeEvent("d", "2026-07-01", 540)]
        let sorted = unsorted.sorted(by: CalendarEventOrder.byDateThenStart)
        XCTAssertEqual(sorted.map(\.id), ["d", "a", "b", "c"],
                       "[#F0] date → startMinute → id の昇順でない (実測 \(sorted.map(\.id)))")
    }

    /// [#F7 / §7.1 #7 / §8] AvailabilityBar は孤児のまま保全され、指定のパスに在る
    func testF7AvailabilityBarIsPreservedAtDesignedPath() {
        let path = repoRoot().appendingPathComponent("Atender/Features/Rooms/AvailabilityBar.swift")
        XCTAssertTrue(FileManager.default.fileExists(atPath: path.path),
                      "[#F7] AvailabilityBar.swift が §8 の配置に無い")
        // 型が生きている (削除されていない) ことをコンパイルで担保する
        let bar = AvailabilityBar(date: "2026-07-27",
                                  members: [member("u1", name: "A", color: "hsl(1, 70%, 45%)")],
                                  events: [], expanded: false, onToggle: {})
        XCTAssertNotNil(bar, "[#F7] AvailabilityBar を構築できない")
    }

    /// [#F8 / §8] 設計が指定した新規/移動ファイルが全て在る (「実装が散っている」の是正)
    func testF8DesignedFileLayoutExists() {
        let expected = [
            "Atender/Core/DesignSystem/GridLine.swift",
            "Atender/Core/DesignSystem/PageScroll.swift",
            "Atender/Core/Data/CalendarMonthStore.swift",
            "Atender/Core/Timetable/CalendarWindow.swift",
            "Atender/Features/Calendar/CalendarMonth.swift",
            "Atender/Features/Calendar/CalendarScreen.swift",
            "Atender/Features/Calendar/PersonalCalendar.swift",
            "Atender/Features/Rooms/RoomCalendar.swift",
            "Atender/Features/Rooms/RoomTimetable.swift",
            "Atender/Features/Rooms/AvailabilityBar.swift",
        ]
        for relative in expected {
            let path = repoRoot().appendingPathComponent(relative).path
            XCTAssertTrue(FileManager.default.fileExists(atPath: path), "[#F8] \(relative) が無い")
        }
    }

    /// [#F9 / §7.3] 削除対象が本当に消えている (grep でなくファイル内容で確認)
    func testF9DeletedSymbolsAreGone() throws {
        let personal = try String(contentsOf: repoRoot().appendingPathComponent("Atender/Features/Calendar/PersonalCalendar.swift"),
                                  encoding: .utf8)
        XCTAssertFalse(personal.contains("struct PeriodNav"), "[#F9] PeriodNav が残っている")

        // 全ソースを走査して削除対象の識別子がどこにも無いことを確認する
        let root = repoRoot().appendingPathComponent("Atender")
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        var offenders: [String] = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            for banned in ["room-fab-event", "room-fab-ics", "cardChromeHeight", "gridAvailable(", "onChangeAnchor", "RoomDetailTab", "RoomsRoute", "roomsPath", "isVisible(rooms:"] where text.contains(banned) {
                offenders.append("\(url.lastPathComponent): \(banned)")
            }
        }
        XCTAssertEqual(offenders, [], "[#F9] 削除対象が本番コードに残っている: \(offenders)")
    }
}
