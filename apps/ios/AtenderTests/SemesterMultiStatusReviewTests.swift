import SwiftUI
import XCTest
@testable import Atender

/// Reviewer blind tests — .designs/20260729-semester-calendar-multi-status.md §5.2〜§5.7 / §5.10
/// ケース ID は設計doc と 1:1。Web 側 (tests/lib/dayStatusVisual.review.test.ts) と
/// 同じ ID・同じ入力・同じ期待値を持つ (§6.2)。実装コードは未読。
final class SemesterMultiStatusReviewTests: XCTestCase {

    // MARK: - helpers

    /// (p, a, e, t, el, s, u) — 設計doc §5.2 の表の並び
    private func counts(
        _ p: Int, _ a: Int, _ e: Int, _ t: Int, _ el: Int, _ s: Int, _ u: Int
    ) -> AttendanceDayCounts {
        AttendanceDayCounts(
            present: p, absent: a, excused: e, tardy: t, earlyLeave: el, suspended: s, unrecorded: u
        )
    }

    private func summary(
        _ c: AttendanceDayCounts,
        status: AttendanceDayStatus = .allPresent
    ) -> AttendanceDaySummary {
        let total = c.present + c.absent + c.excused + c.tardy + c.earlyLeave + c.suspended + c.unrecorded
        return AttendanceDaySummary(date: "2026-06-11", status: status, occurrenceCount: total, counts: c)
    }

    /// counts を持たない旧 API のレスポンス (§4.4)
    private func legacySummary(_ status: AttendanceDayStatus) -> AttendanceDaySummary {
        AttendanceDaySummary(date: "2026-06-11", status: status, occurrenceCount: 1, counts: nil)
    }

    private func shape(_ marks: [AttendanceDayVisual.Mark]) -> [String] {
        marks.map { "\($0.kind.rawValue)x\($0.count)" }
    }

    private func assertVisual(
        _ visual: AttendanceDayVisual.DayVisual,
        _ expected: [String],
        _ dashed: Bool,
        _ id: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(shape(visual.marks), expected, "\(id) marks", file: file, line: line)
        XCTAssertEqual(visual.dashed, dashed, "\(id) dashed", file: file, line: line)
    }

    private func mark(for kind: AttendanceDayVisual.Kind) -> AttendanceDayVisual.Mark? {
        let table: [AttendanceDayVisual.Kind: AttendanceDayCounts] = [
            .absent: counts(0, 1, 0, 0, 0, 0, 0),
            .excused: counts(0, 0, 1, 0, 0, 0, 0),
            .tardy: counts(0, 0, 0, 1, 0, 0, 0),
            .suspended: counts(0, 0, 0, 0, 0, 1, 0),
            .present: counts(1, 0, 0, 0, 0, 0, 0),
            .unrecorded: counts(0, 0, 0, 0, 0, 0, 1),
        ]
        guard let c = table[kind] else { return nil }
        let marks = AttendanceDayVisual.dayVisual(summary: summary(c), isFuture: false).marks
        XCTAssertEqual(marks.count, 1, "\(kind.rawValue) should produce exactly 1 mark")
        return marks.first
    }

    // MARK: - §5.2 過去日 (counts あり)

    func testD1PastPresentOnly() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(2, 0, 0, 0, 0, 0, 0)), isFuture: false),
                     ["presentx2"], false, "D1")
    }

    func testD2PastAbsentAndPresent() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(3, 1, 0, 0, 0, 0, 0)), isFuture: false),
                     ["absentx1", "presentx3"], false, "D2")
    }

    func testD3PastExcusedAndPresent() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(2, 0, 1, 0, 0, 0, 0)), isFuture: false),
                     ["excusedx1", "presentx2"], false, "D3")
    }

    func testD4PastTardyMergesEarlyLeave() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(1, 0, 0, 1, 1, 0, 0)), isFuture: false),
                     ["tardyx2", "presentx1"], false, "D4")
    }

    func testD5PastSuspendedOnly() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 0, 0, 0, 2, 0)), isFuture: false),
                     ["suspendedx2"], false, "D5")
    }

    func testD6PastUnrecordedOnlyIsDashed() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 0, 0, 0, 0, 3)), isFuture: false),
                     ["unrecordedx3"], true, "D6")
    }

    func testD7PastPresentAndUnrecordedIsDashed() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(1, 0, 0, 0, 0, 0, 2)), isFuture: false),
                     ["presentx1", "unrecordedx2"], true, "D7")
    }

    func testD8PastAllZero() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 0, 0, 0, 0, 0)), isFuture: false),
                     [], false, "D8")
    }

    func testD9PastFiveKindsNoTruncation() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(1, 1, 1, 1, 0, 1, 0)), isFuture: false),
                     ["absentx1", "excusedx1", "tardyx1", "suspendedx1", "presentx1"], false, "D9")
    }

    func testD10PastExcusedAndUnrecorded() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 2, 0, 0, 0, 1)), isFuture: false),
                     ["excusedx2", "unrecordedx1"], true, "D10")
    }

    // MARK: - §5.3 未来日 (counts あり)

    func testD11FutureUnrecordedOnlyIsHidden() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 0, 0, 0, 0, 2)), isFuture: true),
                     [], false, "D11")
    }

    func testD12FutureExcusedStaysVisible() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 1, 0, 0, 0, 1)), isFuture: true),
                     ["excusedx1"], false, "D12")
    }

    func testD13FutureSuspendedStaysVisible() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 0, 0, 0, 1, 0)), isFuture: true),
                     ["suspendedx1"], false, "D13")
    }

    func testD14FutureAbsentStaysVisible() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 1, 0, 0, 0, 0, 1)), isFuture: true),
                     ["absentx1"], false, "D14")
    }

    func testD15FuturePresentStaysVisible() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(2, 0, 0, 0, 0, 0, 0)), isFuture: true),
                     ["presentx2"], false, "D15")
    }

    func testD16FutureAllZero() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary(counts(0, 0, 0, 0, 0, 0, 0)), isFuture: true),
                     [], false, "D16")
    }

    // MARK: - §5.4 legacy 経路 (counts が nil)

    func testD17LegacyAllPresentPast() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.allPresent), isFuture: false),
                     ["presentx1"], false, "D17")
    }

    func testD18LegacyHasAbsentPast() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.hasAbsent), isFuture: false),
                     ["absentx1"], false, "D18")
    }

    func testD19LegacyHasTardyPast() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.hasTardy), isFuture: false),
                     ["tardyx1"], false, "D19")
    }

    func testD20LegacyAllSuspendedPast() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.allSuspended), isFuture: false),
                     ["suspendedx1"], false, "D20")
    }

    func testD21LegacyPartialUnrecordedPastIsDashed() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.partialUnrecorded), isFuture: false),
                     ["unrecordedx1"], true, "D21")
    }

    func testD22LegacyNoClassPast() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.noClass), isFuture: false),
                     [], false, "D22")
    }

    func testD23LegacyAllPresentFutureIsHidden() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.allPresent), isFuture: true),
                     [], false, "D23")
    }

    func testD24LegacyHasAbsentFutureIsHidden() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.hasAbsent), isFuture: true),
                     [], false, "D24")
    }

    func testD25LegacyPartialUnrecordedFutureIsHidden() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.partialUnrecorded), isFuture: true),
                     [], false, "D25")
    }

    func testD26LegacyAllSuspendedFutureStaysVisible() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.allSuspended), isFuture: true),
                     ["suspendedx1"], false, "D26")
    }

    func testD27LegacyUnknownStatus() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: legacySummary(.unknown), isFuture: false),
                     [], false, "D27")
    }

    // MARK: - §5.5 異常系

    func testD28NilSummary() {
        assertVisual(AttendanceDayVisual.dayVisual(summary: nil, isFuture: false), [], false, "D28")
    }

    func testD29ZeroCountsWithNonZeroOccurrenceCount() {
        let s = AttendanceDaySummary(
            date: "2026-06-11",
            status: .partialUnrecorded,
            occurrenceCount: 3,
            counts: counts(0, 0, 0, 0, 0, 0, 0)
        )
        assertVisual(AttendanceDayVisual.dayVisual(summary: s, isFuture: false), [], false, "D29")
    }

    func testD30NegativeCountsAreDropped() {
        let s = summary(counts(1, -2, 0, 0, 0, 0, -1))
        assertVisual(AttendanceDayVisual.dayVisual(summary: s, isFuture: false), ["presentx1"], false, "D30")
    }

    // MARK: - §5.6 マークの属性

    func testM1AbsentAttributes() throws {
        let m = try XCTUnwrap(mark(for: .absent))
        XCTAssertEqual(m.icon, .x)
        XCTAssertEqual(m.iconColor, Color.statusAbsent)
        XCTAssertEqual(m.tintColor, Color.statusAbsent)
        XCTAssertEqual(Double(m.tintFraction), Double(Color.surfaceTintRatio), accuracy: 0.0001)
    }

    func testM2ExcusedAttributes() throws {
        let m = try XCTUnwrap(mark(for: .excused))
        XCTAssertEqual(m.icon, .excused)
        XCTAssertEqual(m.iconColor, Color.statusExcused)
        XCTAssertEqual(m.tintColor, Color.statusExcused)
        XCTAssertEqual(Double(m.tintFraction), Double(Color.surfaceTintRatio), accuracy: 0.0001)
    }

    func testM3TardyAttributes() throws {
        let m = try XCTUnwrap(mark(for: .tardy))
        XCTAssertEqual(m.icon, .clock)
        XCTAssertEqual(m.iconColor, Color.statusTardy)
        XCTAssertEqual(m.tintColor, Color.statusTardy)
        XCTAssertEqual(Double(m.tintFraction), Double(Color.surfaceTintRatio), accuracy: 0.0001)
    }

    func testM4SuspendedAttributes() throws {
        let m = try XCTUnwrap(mark(for: .suspended))
        XCTAssertEqual(m.icon, .ban)
        XCTAssertEqual(m.iconColor, Color.statusSuspended)
        XCTAssertEqual(m.tintColor, Color.statusSuspended)
        XCTAssertEqual(Double(m.tintFraction), Double(Color.surfaceTintRatio), accuracy: 0.0001)
    }

    func testM5PresentAttributes() throws {
        let m = try XCTUnwrap(mark(for: .present))
        XCTAssertEqual(m.icon, .check)
        XCTAssertEqual(m.iconColor, Color.statusPresent)
        XCTAssertEqual(m.tintColor, Color.statusPresent)
        XCTAssertEqual(Double(m.tintFraction), Double(Color.surfaceTintRatio), accuracy: 0.0001)
    }

    func testM6UnrecordedAttributes() throws {
        let m = try XCTUnwrap(mark(for: .unrecorded))
        XCTAssertEqual(m.icon, .minus)
        XCTAssertEqual(m.iconColor, Color.textTertiary)
        XCTAssertEqual(m.tintColor, Color.statusNone)
        XCTAssertEqual(Double(m.tintFraction), 0.12, accuracy: 0.0001)
    }

    func testM7KindDeclarationOrderMatchesWeb() {
        XCTAssertEqual(
            AttendanceDayVisual.Kind.allCases.map(\.rawValue),
            ["absent", "excused", "tardy", "suspended", "present", "unrecorded"]
        )
    }

    // MARK: - §5.7 背景 / グリフ

    func testB1BackgroundSlicesForAbsentAndPresent() {
        let marks = AttendanceDayVisual.dayVisual(summary: summary(counts(3, 1, 0, 0, 0, 0, 0)), isFuture: false).marks
        let slices = AttendanceDayVisual.backgroundSlices(marks)
        XCTAssertEqual(slices.count, 4)
        XCTAssertEqual(slices[0].color, Color.statusAbsent.opacity(Color.surfaceTintRatio))
        for i in 1..<4 {
            XCTAssertEqual(slices[i].color, Color.statusPresent.opacity(Color.surfaceTintRatio))
        }
        for slice in slices {
            XCTAssertEqual(slice.fraction, 0.25, accuracy: 0.0001)
        }
    }

    func testB2BackgroundSlicesForPresentOnly() {
        let marks = AttendanceDayVisual.dayVisual(summary: summary(counts(2, 0, 0, 0, 0, 0, 0)), isFuture: false).marks
        let slices = AttendanceDayVisual.backgroundSlices(marks)
        XCTAssertEqual(slices.count, 2)
        for slice in slices {
            XCTAssertEqual(slice.color, Color.statusPresent.opacity(Color.surfaceTintRatio))
            XCTAssertEqual(slice.fraction, 0.5, accuracy: 0.0001)
        }
    }

    func testB3BackgroundSlicesForEmptyMarks() {
        XCTAssertTrue(AttendanceDayVisual.backgroundSlices([]).isEmpty)
    }

    func testB6GlyphsTakeTopTwoOnly() {
        let marks = AttendanceDayVisual.dayVisual(summary: summary(counts(1, 1, 1, 1, 0, 1, 0)), isFuture: false).marks
        XCTAssertGreaterThanOrEqual(marks.count, 3)
        let glyphs = AttendanceDayVisual.glyphs(marks)
        XCTAssertEqual(glyphs.count, 2)
        XCTAssertEqual(glyphs.map(\.kind), [.absent, .excused])
    }

    func testB7GlyphsForSingleMark() {
        let marks = AttendanceDayVisual.dayVisual(summary: summary(counts(2, 0, 0, 0, 0, 0, 0)), isFuture: false).marks
        XCTAssertEqual(AttendanceDayVisual.glyphs(marks).count, 1)
    }

    func testB8GlyphsForEmptyMarks() {
        XCTAssertTrue(AttendanceDayVisual.glyphs([]).isEmpty)
    }

    // MARK: - §5.10 DTO デコード

    private func loadFixture(_ name: String) throws -> Data {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("Fixture \(name).json がテストバンドルに含まれていない")
        }
        return try Data(contentsOf: url)
    }

    /// T1: 共有 fixture 経由の decode (型直書きの decode テストで済ませない — §6.2-4)
    func testT1SemesterOverviewFixtureCarriesCounts() throws {
        let data = try loadFixture("semesterOverview")
        let dto = try JSONDecoder().decode(SemesterOverviewDto.self, from: data)
        XCTAssertGreaterThan(dto.days.count, 0)
        for day in dto.days {
            let c = try XCTUnwrap(day.counts, "day \(day.date) は counts を持つべき")
            let sum = c.present + c.absent + c.excused + c.tardy + c.earlyLeave + c.suspended + c.unrecorded
            XCTAssertEqual(sum, day.occurrenceCount, "day \(day.date) の counts 合計 != occurrenceCount")
        }
        // fixture のどれか 1 日は実データを持つ (全 0 の fixture では T1 が空証明になる)
        XCTAssertTrue(dto.days.contains { $0.occurrenceCount > 0 })
    }

    /// T2: counts を持たない旧 API の JSON でも decode でき counts == nil
    func testT2SummaryWithoutCountsDecodesToNil() throws {
        let jsonText = """
        {"date":"2026-06-11","status":"ALL_PRESENT","occurrenceCount":2}
        """
        let data = try XCTUnwrap(jsonText.data(using: .utf8))
        let summary = try JSONDecoder().decode(AttendanceDaySummary.self, from: data)
        XCTAssertNil(summary.counts)
        XCTAssertEqual(summary.occurrenceCount, 2)
        // legacy 経路 (§4.4) に落ちる
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary, isFuture: false), ["presentx1"], false, "T2")
    }

    /// T3: counts を持つ JSON からの decode → §5.2 の表どおり
    func testT3DecodedSummaryWithCountsFollowsSection52() throws {
        let jsonText = """
        {"date":"2026-06-11","status":"HAS_ABSENT","occurrenceCount":4,
         "counts":{"present":3,"absent":1,"excused":0,"tardy":0,"earlyLeave":0,"suspended":0,"unrecorded":0}}
        """
        let data = try XCTUnwrap(jsonText.data(using: .utf8))
        let summary = try JSONDecoder().decode(AttendanceDaySummary.self, from: data)
        assertVisual(AttendanceDayVisual.dayVisual(summary: summary, isFuture: false),
                     ["absentx1", "presentx3"], false, "T3")
    }
}
