import XCTest
import SwiftUI
@testable import Atender

// Reviewer 生成: 設計 §T-7 (CalendarEventDisplay) を根拠に検証。
final class CalendarEventDisplayTests: XCTestCase {

    func testDayStatusColor() {
        XCTAssertEqual(CalendarEventDisplay.dayStatusColor(.allPresent), Color.statusPresent)
        XCTAssertEqual(CalendarEventDisplay.dayStatusColor(.hasAbsent), Color.statusAbsent)
        XCTAssertEqual(CalendarEventDisplay.dayStatusColor(.hasTardy), Color.statusTardy)
        XCTAssertEqual(CalendarEventDisplay.dayStatusColor(.allSuspended), Color.statusCancelled)
        XCTAssertEqual(CalendarEventDisplay.dayStatusColor(.partialUnrecorded), Color.statusNone)
    }

    func testDayStatusLabel() {
        XCTAssertEqual(CalendarEventDisplay.dayStatusLabel(.allPresent), "出席")
        XCTAssertEqual(CalendarEventDisplay.dayStatusLabel(.hasAbsent), "欠席あり")
        XCTAssertEqual(CalendarEventDisplay.dayStatusLabel(.hasTardy), "遅刻・早退あり")
        XCTAssertEqual(CalendarEventDisplay.dayStatusLabel(.allSuspended), "休講")
        XCTAssertEqual(CalendarEventDisplay.dayStatusLabel(.partialUnrecorded), "未記録あり")
    }

    func testEventTitle() {
        let meeting = CalendarEvent(kind: .meeting, id: "m", date: "2026-06-22", title: "情報デザイン",
                                    startMinute: 540, endMinute: 630, color: "#111111", subtitle: "自分", courseId: "c1")
        let personal = CalendarEvent(kind: .personal, id: "e", date: "2026-06-22", title: "バイト",
                                     startMinute: 600, endMinute: 660, color: "#8b5cf6", subtitle: "自分", courseId: nil)
        XCTAssertEqual(CalendarEventDisplay.eventTitle(meeting), "情報デザイン")
        XCTAssertEqual(CalendarEventDisplay.eventTitle(personal), "バイト")
    }
}
