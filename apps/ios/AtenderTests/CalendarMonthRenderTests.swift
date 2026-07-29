import SwiftUI
import UIKit
import XCTest
@testable import Atender

/// 設計 §1.4 / §1.6「当月外の日はイベント chip / ステータスドットを描かない」を
/// **実 View のオフスクリーン描画** (ImageRenderer) で確かめる。
/// 判定は「当月外にだけ内容を足しても描画が 1 bit も変わらない」+
/// 「当月内に同じ内容を足すと必ず変わる」の対 (= 計測が無力でないことの同時証明)。
@MainActor
final class CalendarMonthRenderTests: XCTestCase {

    private let anchor = "2026-07-01"
    private let outsideDate = "2026-06-30"   // グリッド先頭行 (当月外)
    private let insideDate = "2026-07-15"    // 当月

    private func event(date: String, color: String) -> CalendarEvent {
        CalendarEvent(kind: .personal,
                      id: "e-\(date)",
                      date: date,
                      title: "予定",
                      startMinute: 540,
                      endMinute: 630,
                      color: color,
                      subtitle: "",
                      courseId: "")
    }

    private func summary(date: String) throws -> AttendanceDaySummary {
        let json = """
        {
          "date": "\(date)",
          "status": "HAS_ABSENT",
          "occurrenceCount": 3,
          "counts": {"present": 1, "absent": 1, "excused": 1, "tardy": 0, "earlyLeave": 0, "suspended": 0, "unrecorded": 0}
        }
        """
        return try JSONDecoder().decode(AttendanceDaySummary.self, from: Data(json.utf8))
    }

    private func render(events: [CalendarEvent], daySummaries: [String: AttendanceDaySummary]) throws -> Data {
        let view = CalendarMonth(anchor: anchor,
                                 selectedDate: insideDate,
                                 events: events,
                                 daySummaries: daySummaries,
                                 onSelectDate: { _ in })
            .frame(width: 345)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: 345, height: 500)
        let image = try XCTUnwrap(renderer.uiImage, "ImageRenderer が nil")
        return try XCTUnwrap(image.pngData(), "pngData が nil")
    }

    /// [calendar-defects #R1] 当月外の日に event を足しても描画が変わらない / 当月内なら変わる
    func testR1OutsideMonthEventIsNotDrawn() throws {
        let empty = try render(events: [], daySummaries: [:])
        let outside = try render(events: [event(date: outsideDate, color: "#FF00FF")], daySummaries: [:])
        let inside = try render(events: [event(date: insideDate, color: "#FF00FF")], daySummaries: [:])

        XCTAssertNotEqual(empty, inside, "[#R1] 当月内の chip が描かれていない (計測が無力)")
        XCTAssertEqual(empty, outside, "[#R1] 当月外の日に chip が描かれている")
    }

    /// [calendar-defects #R2] 当月外の日に daySummary を足してもドットが描かれない / 当月内なら描かれる
    func testR2OutsideMonthDotsAreNotDrawn() throws {
        let empty = try render(events: [], daySummaries: [:])
        let outside = try render(events: [], daySummaries: [outsideDate: try summary(date: outsideDate)])
        let inside = try render(events: [], daySummaries: [insideDate: try summary(date: insideDate)])

        XCTAssertNotEqual(empty, inside, "[#R2] 当月内のドットが描かれていない (計測が無力)")
        XCTAssertEqual(empty, outside, "[#R2] 当月外の日にドットが描かれている")
    }

    /// [calendar-defects #R3] 当月外に大量の予定 (溢れ候補) を足しても描画不変
    func testR3OutsideMonthOverflowIsNotDrawn() throws {
        let empty = try render(events: [], daySummaries: [:])
        let many = (0..<5).map { index in
            CalendarEvent(kind: .personal, id: "x\(index)", date: outsideDate, title: "長いタイトルの予定\(index)",
                          startMinute: 540 + index * 60, endMinute: 600 + index * 60,
                          color: "#FF00FF", subtitle: "", courseId: "")
        }
        let outside = try render(events: many, daySummaries: [outsideDate: try summary(date: outsideDate)])

        XCTAssertEqual(empty, outside, "[#R3] 当月外に chip/+N/ドットのいずれかが描かれている")
    }

    /// [calendar-defects #R4] 予定 3 件の日と 0 件の日が同じ行にあっても、行の高さ/幅が変わらない
    /// (= §1.5 の固定 rowHeight と EqualColumnsLayout が効いており、行が波打たない)
    func testR4MixedEventCountsKeepIdenticalCanvasSize() throws {
        let sparse = try renderImage(events: [event(date: "2026-07-06", color: "#0091FF")])
        let dense = try renderImage(events: (0..<3).map { index in
            CalendarEvent(kind: .personal, id: "d\(index)", date: "2026-07-07", title: "予定\(index)",
                          startMinute: 540 + index * 60, endMinute: 600 + index * 60,
                          color: "#0091FF", subtitle: "", courseId: "")
        } + [event(date: "2026-07-06", color: "#0091FF")])

        XCTAssertEqual(sparse.size.width, dense.size.width, accuracy: 0.01, "[#R4] 幅が内容で変わった")
        XCTAssertEqual(sparse.size.height, dense.size.height, accuracy: 0.01, "[#R4] 高さが内容で変わった")
        XCTAssertEqual(sparse.size.width, 345, accuracy: 0.01, "[#R4] 提案幅を超えた")
    }

    private func renderImage(events: [CalendarEvent]) throws -> UIImage {
        let view = CalendarMonth(anchor: anchor,
                                 selectedDate: insideDate,
                                 events: events,
                                 daySummaries: [:],
                                 onSelectDate: { _ in })
            .frame(width: 345)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: 345, height: 500)
        return try XCTUnwrap(renderer.uiImage)
    }
}

/// 設計 §3「AttendanceCalendar は環境注入なしで単体レンダリングできる純 View になる」
@MainActor
final class AttendanceCalendarRenderTests: XCTestCase {

    private func render(selectionMode: Bool, selected: Set<String>) throws -> Data {
        let view = AttendanceCalendar(days: [],
                                      startDate: "2026-06-05",
                                      endDate: "2026-06-25",
                                      today: "2026-06-11",
                                      selectionMode: selectionMode,
                                      selectedDates: selected,
                                      onSelectDay: { _ in },
                                      onToggleSelectionMode: {},
                                      onToggleDate: { _ in })
            .frame(width: 361)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: 361, height: 700)
        let image = try XCTUnwrap(renderer.uiImage, "[#R5] AppEnvironment 未注入でレンダリングできない")
        return try XCTUnwrap(image.pngData())
    }

    /// [calendar-defects #R5] AppEnvironment を注入せずに描画できる (§3 の副次的利得)
    func testR5RendersWithoutAppEnvironment() throws {
        let data = try render(selectionMode: false, selected: [])
        XCTAssertGreaterThan(data.count, 1000, "[#R5]")
    }

    /// [calendar-defects #R6] 複数選択モードにすると描画が変わる (= isBlanked が View に配線されている)
    /// ※ 「範囲外だけが消えた」ことまでは pixel では特定していない (M5 の手動ゲートは残る)
    func testR6SelectionModeChangesRendering() throws {
        let normal = try render(selectionMode: false, selected: [])
        let selecting = try render(selectionMode: true, selected: [])

        XCTAssertNotEqual(normal, selecting, "[#R6] 複数選択モードで描画が変わらない")
    }
}
