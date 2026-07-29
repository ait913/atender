import XCTest
import SwiftUI
@testable import Atender

final class SemesterLogicTests: XCTestCase {

    // MARK: - AttendanceDayVisual

    func testD1ToD10PastDayMarks() {
        assertMarks(visual(counts(present: 2), occurrenceCount: 2), [(.present, 2)], dashed: false)                      // D1
        assertMarks(visual(counts(present: 3, absent: 1), occurrenceCount: 4), [(.absent, 1), (.present, 3)], dashed: false)  // D2
        assertMarks(visual(counts(present: 2, excused: 1), occurrenceCount: 3), [(.excused, 1), (.present, 2)], dashed: false) // D3
        assertMarks(visual(counts(present: 1, tardy: 1, earlyLeave: 1), occurrenceCount: 3), [(.tardy, 2), (.present, 1)], dashed: false) // D4
        assertMarks(visual(counts(suspended: 2), occurrenceCount: 2), [(.suspended, 2)], dashed: false)                  // D5
        assertMarks(visual(counts(unrecorded: 3), occurrenceCount: 3), [(.unrecorded, 3)], dashed: true)                 // D6
        assertMarks(visual(counts(present: 1, unrecorded: 2), occurrenceCount: 3), [(.present, 1), (.unrecorded, 2)], dashed: true) // D7
        assertMarks(visual(counts(), occurrenceCount: 0), [], dashed: false)                                             // D8
        assertMarks(
            visual(counts(present: 1, absent: 1, excused: 1, tardy: 1, suspended: 1), occurrenceCount: 5),
            [(.absent, 1), (.excused, 1), (.tardy, 1), (.suspended, 1), (.present, 1)],
            dashed: false
        )                                                                                                                // D9
        assertMarks(visual(counts(excused: 2, unrecorded: 1), occurrenceCount: 3), [(.excused, 2), (.unrecorded, 1)], dashed: true) // D10
    }

    func testD11ToD16FutureDayMarks() {
        assertMarks(visual(counts(unrecorded: 2), occurrenceCount: 2, isFuture: true), [], dashed: false)                 // D11
        assertMarks(visual(counts(excused: 1, unrecorded: 1), occurrenceCount: 2, isFuture: true), [(.excused, 1)], dashed: false) // D12
        assertMarks(visual(counts(suspended: 1), occurrenceCount: 1, isFuture: true), [(.suspended, 1)], dashed: false)   // D13
        assertMarks(visual(counts(absent: 1, unrecorded: 1), occurrenceCount: 2, isFuture: true), [(.absent, 1)], dashed: false) // D14
        assertMarks(visual(counts(present: 2), occurrenceCount: 2, isFuture: true), [(.present, 2)], dashed: false)       // D15
        assertMarks(visual(counts(), occurrenceCount: 0, isFuture: true), [], dashed: false)                              // D16
    }

    func testD17ToD27LegacyPathWithoutCounts() {
        assertMarks(legacyVisual(.allPresent), [(.present, 1)], dashed: false)          // D17
        assertMarks(legacyVisual(.hasAbsent), [(.absent, 1)], dashed: false)            // D18
        assertMarks(legacyVisual(.hasTardy), [(.tardy, 1)], dashed: false)              // D19
        assertMarks(legacyVisual(.allSuspended), [(.suspended, 1)], dashed: false)      // D20
        assertMarks(legacyVisual(.partialUnrecorded), [(.unrecorded, 1)], dashed: true) // D21
        assertMarks(legacyVisual(.noClass), [], dashed: false)                          // D22
        assertMarks(legacyVisual(.allPresent, isFuture: true), [], dashed: false)       // D23
        assertMarks(legacyVisual(.hasAbsent, isFuture: true), [], dashed: false)        // D24
        assertMarks(legacyVisual(.partialUnrecorded, isFuture: true), [], dashed: false) // D25
        assertMarks(legacyVisual(.allSuspended, isFuture: true), [(.suspended, 1)], dashed: false) // D26
        assertMarks(legacyVisual(.unknown), [], dashed: false)                          // D27
    }

    func testD28ToD30EdgeCases() {
        assertMarks(AttendanceDayVisual.dayVisual(summary: nil, isFuture: false), [], dashed: false)   // D28
        assertMarks(visual(counts(), occurrenceCount: 3), [], dashed: false)                            // D29
        assertMarks(visual(counts(present: 1, absent: -1), occurrenceCount: 0), [(.present, 1)], dashed: false) // D30
    }

    func testM1ToM7MarkAttributes() {
        // M7: severity 順は Web の DAY_MARK_ORDER と完全一致
        XCTAssertEqual(
            AttendanceDayVisual.Kind.allCases.map(\.rawValue),
            ["absent", "excused", "tardy", "suspended", "present", "unrecorded"]
        )

        let all = visual(counts(present: 1, absent: 1, excused: 1, tardy: 1, suspended: 1, unrecorded: 1), occurrenceCount: 6).marks
        let byKind = Dictionary(uniqueKeysWithValues: all.map { ($0.kind, $0) })
        assertMark(byKind[.absent], icon: .x, iconColor: .statusAbsent, tintColor: .statusAbsent, tintFraction: Double(Color.surfaceTintRatio))       // M1
        assertMark(byKind[.excused], icon: .excused, iconColor: .statusExcused, tintColor: .statusExcused, tintFraction: Double(Color.surfaceTintRatio)) // M2
        assertMark(byKind[.tardy], icon: .clock, iconColor: .statusTardy, tintColor: .statusTardy, tintFraction: Double(Color.surfaceTintRatio))      // M3
        assertMark(byKind[.suspended], icon: .ban, iconColor: .statusSuspended, tintColor: .statusSuspended, tintFraction: Double(Color.surfaceTintRatio)) // M4
        assertMark(byKind[.present], icon: .check, iconColor: .statusPresent, tintColor: .statusPresent, tintFraction: Double(Color.surfaceTintRatio)) // M5
        assertMark(byKind[.unrecorded], icon: .minus, iconColor: .textTertiary, tintColor: .statusNone, tintFraction: 0.12)                            // M6
    }

    func testB1ToB8BackgroundSlicesAndGlyphs() {
        let mixed = visual(counts(present: 3, absent: 1), occurrenceCount: 4).marks
        let mixedSlices = AttendanceDayVisual.backgroundSlices(mixed)
        // B1
        XCTAssertEqual(mixedSlices.count, 4)
        XCTAssertEqual(mixedSlices[0].color, Color.statusAbsent.opacity(Double(Color.surfaceTintRatio)))
        for index in 1...3 {
            XCTAssertEqual(mixedSlices[index].color, Color.statusPresent.opacity(Double(Color.surfaceTintRatio)))
        }
        for slice in mixedSlices {
            XCTAssertEqual(slice.fraction, 0.25, accuracy: 0.0001)
        }

        // B2
        let singleSlices = AttendanceDayVisual.backgroundSlices(visual(counts(present: 2), occurrenceCount: 2).marks)
        XCTAssertEqual(singleSlices.count, 2)
        for slice in singleSlices {
            XCTAssertEqual(slice.fraction, 0.5, accuracy: 0.0001)
        }

        // B3
        XCTAssertTrue(AttendanceDayVisual.backgroundSlices([]).isEmpty)
        XCTAssertTrue(AttendanceDayVisual.glyphs([]).isEmpty)                              // B8

        // B6
        let many = visual(counts(present: 1, absent: 1, excused: 1, tardy: 1, suspended: 1), occurrenceCount: 5).marks
        XCTAssertEqual(AttendanceDayVisual.glyphs(many).map(\.kind), [.absent, .excused])

        // B7
        XCTAssertEqual(AttendanceDayVisual.glyphs(mixed).count, 2)
        XCTAssertEqual(AttendanceDayVisual.glyphs(visual(counts(present: 2), occurrenceCount: 2).marks).count, 1)
    }

    // MARK: - SemesterCalendarGrid

    func testSemesterCalendarGridCellsForJuly2026() throws {
        let cells = SemesterCalendarGrid.cells(monthAnchor: "2026-07-01")

        XCTAssertEqual(cells.first, "2026-06-28")
        XCTAssertEqual(cells.last, "2026-08-01")
        XCTAssertTrue(cells.contains("2026-08-01"))
        XCTAssertTrue([35, 42].contains(cells.count))
        XCTAssertEqual(weekday(cells[0]), 1)
        XCTAssertEqual(weekday(try XCTUnwrap(cells.last)), 7)

        for index in cells.indices.dropFirst() {
            XCTAssertEqual(
                cells[index],
                day(after: cells[index - 1]),
                "cells[\(index)] should be the day after cells[\(index - 1)]"
            )
        }
    }

    func testSemesterCalendarGridClampMonth() {
        XCTAssertEqual(
            SemesterCalendarGrid.clampMonth("2026-05-15", start: "2026-06-01", end: "2026-08-31"),
            "2026-06-01"
        )
        XCTAssertEqual(
            SemesterCalendarGrid.clampMonth("2026-07-15", start: "2026-06-01", end: "2026-08-31"),
            "2026-07-01"
        )
        XCTAssertEqual(
            SemesterCalendarGrid.clampMonth("2026-09-10", start: "2026-06-01", end: "2026-08-31"),
            "2026-08-01"
        )
    }

    func testSemesterCalendarGridBounds() {
        XCTAssertTrue(SemesterCalendarGrid.atStart(anchor: "2026-06-10", start: "2026-06-01"))
        XCTAssertFalse(SemesterCalendarGrid.atStart(anchor: "2026-07-01", start: "2026-06-01"))

        XCTAssertTrue(SemesterCalendarGrid.atEnd(anchor: "2026-08-20", end: "2026-08-31"))
        XCTAssertFalse(SemesterCalendarGrid.atEnd(anchor: "2026-07-01", end: "2026-08-31"))
    }

    func testSemesterCalendarGridSundayOf() {
        XCTAssertEqual(SemesterCalendarGrid.sundayOf("2026-07-01"), "2026-06-28")
        XCTAssertEqual(SemesterCalendarGrid.sundayOf("2026-06-28"), "2026-06-28")
    }

    // MARK: - DayDetailLogic

    func testDayDetailLogicExcludesCourseSuspensions() throws {
        let dto = try decodeDayDetail(
            occurrences: [
                occurrenceJSON(id: "occ-a", courseId: "c1", status: #""PRESENT""#),
                occurrenceJSON(id: "occ-b", courseId: "c2", status: "null"),
                occurrenceJSON(id: "occ-c", courseId: "c3", status: "null"),
                occurrenceJSON(id: "occ-d", courseId: "c4", status: "null")
            ],
            courseSuspensions: [
                courseSuspensionJSON(id: "susp-d", courseId: "c4")
            ]
        )

        XCTAssertEqual(DayDetailLogic.courseSuspendedIds(dto), Set(["c4"]))
        XCTAssertEqual(DayDetailLogic.unrecordedCount(dto), 2)
        XCTAssertEqual(DayDetailLogic.occurrenceCount(dto), 3)
    }

    func testDayDetailLogicRecordedOccurrencesHaveNoUnrecordedCount() throws {
        let dto = try decodeDayDetail(
            occurrences: [
                occurrenceJSON(id: "occ-a", courseId: "c1", status: #""PRESENT""#),
                occurrenceJSON(id: "occ-b", courseId: "c2", status: #""ABSENT""#),
                occurrenceJSON(id: "occ-c", courseId: "c3", status: #""TARDY""#)
            ],
            courseSuspensions: []
        )

        XCTAssertEqual(DayDetailLogic.unrecordedCount(dto), 0)
    }

    func testDayDetailLogicBulkMode() {
        XCTAssertEqual(DayDetailLogic.bulkMode(unrecordedCount: 0), .overwrite)
        XCTAssertEqual(DayDetailLogic.bulkMode(unrecordedCount: 3), .fill)
    }

    // MARK: - BulkToast

    func testBulkToastFormatDateList() {
        XCTAssertEqual(BulkToast.formatDateList(["2026-07-01", "2026-07-15"]), "7/1, 7/15")
        XCTAssertEqual(BulkToast.formatDateList(["2026-12-05"]), "12/5")
    }

    func testBulkToastCreateSuspensions() {
        XCTAssertEqual(BulkToast.createSuspensions(created: 3, skipped: 0), "3日 休講登録")
        XCTAssertEqual(BulkToast.createSuspensions(created: 2, skipped: 1), "2日 休講登録 (1日 登録済み)")
    }

    // MARK: - Helpers

    private func counts(
        present: Int = 0,
        absent: Int = 0,
        excused: Int = 0,
        tardy: Int = 0,
        earlyLeave: Int = 0,
        suspended: Int = 0,
        unrecorded: Int = 0
    ) -> AttendanceDayCounts {
        AttendanceDayCounts(
            present: present,
            absent: absent,
            excused: excused,
            tardy: tardy,
            earlyLeave: earlyLeave,
            suspended: suspended,
            unrecorded: unrecorded
        )
    }

    private func visual(
        _ counts: AttendanceDayCounts,
        status: AttendanceDayStatus = .allPresent,
        occurrenceCount: Int,
        isFuture: Bool = false
    ) -> AttendanceDayVisual.DayVisual {
        let summary = AttendanceDaySummary(
            date: "2026-06-03",
            status: status,
            occurrenceCount: occurrenceCount,
            counts: counts
        )
        return AttendanceDayVisual.dayVisual(summary: summary, isFuture: isFuture)
    }

    private func legacyVisual(_ status: AttendanceDayStatus, isFuture: Bool = false) -> AttendanceDayVisual.DayVisual {
        let summary = AttendanceDaySummary(date: "2026-06-03", status: status, occurrenceCount: 1, counts: nil)
        return AttendanceDayVisual.dayVisual(summary: summary, isFuture: isFuture)
    }

    private func assertMarks(
        _ visual: AttendanceDayVisual.DayVisual,
        _ expected: [(AttendanceDayVisual.Kind, Int)],
        dashed: Bool,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(visual.marks.map(\.kind), expected.map(\.0), file: file, line: line)
        XCTAssertEqual(visual.marks.map(\.count), expected.map(\.1), file: file, line: line)
        XCTAssertEqual(visual.dashed, dashed, file: file, line: line)
    }

    private func assertMark(
        _ mark: AttendanceDayVisual.Mark?,
        icon: AttendanceDayVisual.Icon,
        iconColor: Color,
        tintColor: Color,
        tintFraction: Double,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard let mark else {
            XCTFail("mark should exist", file: file, line: line)
            return
        }
        XCTAssertEqual(mark.icon, icon, file: file, line: line)
        XCTAssertEqual(mark.iconColor, iconColor, file: file, line: line)
        XCTAssertEqual(mark.tintColor, tintColor, file: file, line: line)
        XCTAssertEqual(mark.tintFraction, tintFraction, accuracy: 0.0001, file: file, line: line)
    }

    private func decodeDayDetail(occurrences: [String], courseSuspensions: [String]) throws -> DayDetailDto {
        let json = """
        {
          "date": "2026-07-01",
          "occurrences": [
            \(occurrences.joined(separator: ",\n"))
          ],
          "courseSuspensions": [
            \(courseSuspensions.joined(separator: ",\n"))
          ],
          "timetableSuspension": null,
          "personalEvents": []
        }
        """
        return try JSONDecoder().decode(DayDetailDto.self, from: Data(json.utf8))
    }

    private func occurrenceJSON(id: String, courseId: String, status: String) -> String {
        """
        {
          "id": "\(id)",
          "meetingId": "meeting-\(id)",
          "courseId": "\(courseId)",
          "courseName": "Course \(courseId)",
          "teacher": null,
          "room": null,
          "color": null,
          "date": "2026-07-01",
          "periodIndex": 1,
          "periodOffset": 0,
          "startMinute": 540,
          "endMinute": 630,
          "status": \(status)
        }
        """
    }

    private func courseSuspensionJSON(id: String, courseId: String) -> String {
        """
        {
          "id": "\(id)",
          "courseId": "\(courseId)",
          "date": "2026-07-01",
          "reason": null,
          "createdAt": "2026-07-01T00:00:00.000Z",
          "updatedAt": "2026-07-01T00:00:00.000Z"
        }
        """
    }

    private func day(after value: String) -> String {
        let date = parseDate(value)
        let next = calendar.date(byAdding: .day, value: 1, to: date)!
        return dateFormatter.string(from: next)
    }

    private func weekday(_ value: String) -> Int {
        calendar.component(.weekday, from: parseDate(value))
    }

    private func parseDate(_ value: String) -> Date {
        dateFormatter.date(from: value)!
    }

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)!
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    // MARK: - カレンダー実機不具合の是正 §9-D (Reviewer 生成 / 設計docのみ根拠)

    private var sStart: String { "2026-06-05" }
    private var sEnd: String { "2026-06-25" }

    /// [calendar-defects #S1] 通常モードでは常に false (= 描画・押せる)。モードで意味が反転しない
    func testS1IsBlankedIsAlwaysFalseInNormalMode() {
        for iso in ["2026-06-03", "2026-06-04", "2026-06-05", "2026-06-15", "2026-06-25", "2026-06-26", "2026-07-30", "2020-01-01"] {
            XCTAssertFalse(
                SemesterCalendarGrid.isBlanked(iso: iso, startDate: sStart, endDate: sEnd, selectionMode: false),
                "[calendar-defects #S1] \(iso)"
            )
        }
    }

    /// [calendar-defects #S2/#S3] 複数選択モードで学期範囲外 → true
    func testS2AndS3IsBlankedOutsideSemesterInSelectionMode() {
        XCTAssertTrue(SemesterCalendarGrid.isBlanked(iso: "2026-06-03", startDate: sStart, endDate: sEnd, selectionMode: true),
                      "[calendar-defects #S2] 開始日より前")
        XCTAssertTrue(SemesterCalendarGrid.isBlanked(iso: "2026-06-04", startDate: sStart, endDate: sEnd, selectionMode: true),
                      "[calendar-defects #S2] 開始日の前日")
        XCTAssertTrue(SemesterCalendarGrid.isBlanked(iso: "2026-06-26", startDate: sStart, endDate: sEnd, selectionMode: true),
                      "[calendar-defects #S3] 終了日の翌日")
    }

    /// [calendar-defects #S4/#S5/#S6] 学期内 (境界含む) は false
    func testS4ToS6IsBlankedInsideSemesterInSelectionMode() {
        XCTAssertFalse(SemesterCalendarGrid.isBlanked(iso: "2026-06-05", startDate: sStart, endDate: sEnd, selectionMode: true),
                       "[calendar-defects #S4] 開始日ちょうど")
        XCTAssertFalse(SemesterCalendarGrid.isBlanked(iso: "2026-06-25", startDate: sStart, endDate: sEnd, selectionMode: true),
                       "[calendar-defects #S5] 終了日ちょうど")
        XCTAssertFalse(SemesterCalendarGrid.isBlanked(iso: "2026-06-15", startDate: sStart, endDate: sEnd, selectionMode: true),
                       "[calendar-defects #S6] 学期の中")
    }

    /// [calendar-defects #S2-b] 学期グリッド全セルを走査し、blank になるのは範囲外だけであること
    func testS2bIsBlankedMatchesRangeExactlyAcrossGrid() {
        for iso in SemesterCalendarGrid.cells(monthAnchor: "2026-06-01") {
            let inside = [sStart <= iso, iso <= sEnd].allSatisfy { $0 }
            XCTAssertEqual(
                SemesterCalendarGrid.isBlanked(iso: iso, startDate: sStart, endDate: sEnd, selectionMode: true),
                !inside,
                "[calendar-defects #S2-b] \(iso)"
            )
            XCTAssertFalse(
                SemesterCalendarGrid.isBlanked(iso: iso, startDate: sStart, endDate: sEnd, selectionMode: false),
                "[calendar-defects #S2-b] normal mode \(iso)"
            )
        }
    }

    /// [calendar-defects #S7] 375pt (SE3 / 13 mini) の日セル一辺
    func testS7DayCellSideOnSmallestDevice() {
        let side = SemesterCalendarMetrics.dayCellSide(screenWidth: 375)

        XCTAssertEqual(side, (375 - 32 - 16 - 18) / 7, accuracy: 1e-3, "[calendar-defects #S7]")
        XCTAssertEqual(side, 44.142857, accuracy: 1e-3, "[calendar-defects #S7] 実値")
        XCTAssertGreaterThanOrEqual(side, 44, "[calendar-defects #S7] HIG 44pt")
    }

    /// [calendar-defects #S8] 実機幅すべてで 44pt 以上
    func testS8DayCellSideMeetsTapTargetOnAllDevices() {
        for screenWidth in [CGFloat(375), 393, 402, 430, 440] {
            let side = SemesterCalendarMetrics.dayCellSide(screenWidth: screenWidth)
            XCTAssertGreaterThanOrEqual(side, SemesterCalendarMetrics.minTapTarget,
                                        "[calendar-defects #S8] \(screenWidth) -> \(side)")
        }
        // 設計 §2.3 の表と一致するか
        XCTAssertEqual(SemesterCalendarMetrics.dayCellSide(screenWidth: 393), 46.71, accuracy: 0.01, "[calendar-defects #S8]")
        XCTAssertEqual(SemesterCalendarMetrics.dayCellSide(screenWidth: 402), 47.99, accuracy: 0.01, "[calendar-defects #S8]")
        XCTAssertEqual(SemesterCalendarMetrics.dayCellSide(screenWidth: 430), 52.00, accuracy: 0.01, "[calendar-defects #S8]")
        XCTAssertEqual(SemesterCalendarMetrics.dayCellSide(screenWidth: 440), 53.43, accuracy: 0.01, "[calendar-defects #S8]")
    }

    /// [calendar-defects #S8-b] 修正前の横 padding 16 のままだと 375pt で 44pt に届かない
    /// (= 定数を戻したらテストが落ちる形で 8pt 化を固定する)
    func testS8bOldCardPaddingWouldViolateTapTarget() {
        let oldSide = (CGFloat(375) - Space.pagePxMobile * 2 - Space.s4 * 2
                       - SemesterCalendarMetrics.gridSpacing * 6) / 7
        XCTAssertLessThan(oldSide, SemesterCalendarMetrics.minTapTarget,
                          "[calendar-defects #S8-b] 旧 padding では 41.86pt で規定違反だった")
        XCTAssertGreaterThan(SemesterCalendarMetrics.dayCellSide(screenWidth: 375), oldSide,
                             "[calendar-defects #S8-b]")
    }

    /// [calendar-defects #S9] 定数
    func testS9SemesterCalendarMetricsConstants() {
        XCTAssertEqual(SemesterCalendarMetrics.cardHorizontalPadding, Space.s2, accuracy: 1e-6, "[calendar-defects #S9]")
        XCTAssertEqual(SemesterCalendarMetrics.cardHorizontalPadding, 8, accuracy: 1e-6, "[calendar-defects #S9] Space.s2 == 8")
        XCTAssertEqual(SemesterCalendarMetrics.cardVerticalPadding, Space.s4, accuracy: 1e-6, "[calendar-defects #S9]")
        XCTAssertEqual(SemesterCalendarMetrics.cardVerticalPadding, 16, accuracy: 1e-6, "[calendar-defects #S9] Space.s4 == 16")
        XCTAssertEqual(SemesterCalendarMetrics.innerInset, Space.s2, accuracy: 1e-6, "[calendar-defects #S9]")
        XCTAssertEqual(SemesterCalendarMetrics.gridSpacing, 3, accuracy: 1e-6, "[calendar-defects #S9]")
        XCTAssertEqual(SemesterCalendarMetrics.columnCount, 7, "[calendar-defects #S9]")
        XCTAssertEqual(SemesterCalendarMetrics.minTapTarget, 44, accuracy: 1e-6, "[calendar-defects #S9]")
        // 非グリッド要素は内側で +8 して実効 16pt を保つ
        XCTAssertEqual(SemesterCalendarMetrics.cardHorizontalPadding + SemesterCalendarMetrics.innerInset,
                       Space.s4, accuracy: 1e-6, "[calendar-defects #S9] 実効 16pt")
    }

    /// [calendar-defects #S10] 画面幅 0 / 負でも負値を返さない
    func testS10DayCellSideNeverNegative() {
        XCTAssertEqual(SemesterCalendarMetrics.dayCellSide(screenWidth: 0), 0, accuracy: 1e-6, "[calendar-defects #S10]")
        XCTAssertEqual(SemesterCalendarMetrics.dayCellSide(screenWidth: 10), 0, accuracy: 1e-6, "[calendar-defects #S10]")
        XCTAssertGreaterThanOrEqual(SemesterCalendarMetrics.dayCellSide(screenWidth: -100), 0, "[calendar-defects #S10]")
    }

    /// [calendar-defects #S11] glyphs は最大 2 件 = 学期セルの子 intrinsic 幅が 26pt を超えない根拠
    func testS11GlyphsAreCappedAtTwo() {
        let many = visual(counts(present: 1, absent: 1, excused: 1, tardy: 1, suspended: 1), occurrenceCount: 5).marks
        XCTAssertGreaterThan(many.count, 2, "[calendar-defects #S11] marks 側は 2 件超え")
        XCTAssertEqual(AttendanceDayVisual.glyphs(many).count, 2, "[calendar-defects #S11]")

        let childIntrinsicWidth = CGFloat(2) * 12 + 2   // glyph 12pt x2 + spacing 2
        XCTAssertLessThan(childIntrinsicWidth, SemesterCalendarMetrics.dayCellSide(screenWidth: 375),
                          "[calendar-defects #S11] 子 intrinsic 幅 < 最小列幅")
    }
}
