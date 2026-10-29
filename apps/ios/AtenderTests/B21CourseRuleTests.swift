import SwiftUI
import XCTest
@testable import Atender

/// build 21 レーン B (設計 §4.3.3 / §4.4 / §7.B B25-B36)。設計 doc だけを根拠に生成。
final class B21CourseRuleTests: XCTestCase {

    // MARK: helpers

    private func encodeToObject<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        let obj = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(obj as? [String: Any])
    }

    /// build 20 形 (新キー無し) の CourseStatsDto JSON に extra を足す
    private func statsJSON(extra: String = "") -> Data {
        let json = """
        {
          "courseId": "c1", "courseName": "OS", "teacher": null,
          "generatedOccurrences": 15,
          "counts": {"present": 1, "absent": 0, "excused": 0, "tardy": 0, "earlyLeave": 0, "cancelled": 0, "suspended": 0, "unrecorded": 14},
          "effectiveNumerator": 1, "effectiveDenominator": 15, "attendanceRate": 0.0667,
          "toDate": {"effectiveNumerator": 1, "effectiveDenominator": 1, "attendanceRate": 1},
          "remainingCount": 14, "allowedAbsences": 4, "maxDayPeriods": 1, "allowedAbsenceDays": 4\(extra)
        }
        """
        return Data(json.utf8)
    }

    private func stats(extra: String = "") throws -> CourseStatsDto {
        try JSONDecoder().decode(CourseStatsDto.self, from: statsJSON(extra: extra))
    }

    private func lessonStats(allowedAbsenceLessons: Int?, remainingLessons: Int?, limitedBy: String?) throws -> CourseStatsDto {
        var s = try stats()
        s.allowedAbsenceLessons = allowedAbsenceLessons
        s.remainingLessons = remainingLessons
        s.limitedBy = limitedBy
        return s
    }

    // MARK: B25 / B26 CourseUpdateInput のエンコード

    func testB25RuleSetEncodesAllThreeKeysIncludingNull() throws {
        let input = CourseUpdateInput(
            name: "A",
            rule: CourseRuleValues(requiredAttendanceRate: nil, maxAbsences: 5, tardiesPerAbsence: nil)
        )
        let obj = try encodeToObject(input)
        XCTAssertEqual(Set(obj.keys), ["name", "requiredAttendanceRate", "maxAbsences", "tardiesPerAbsence"])
        XCTAssertEqual(obj["name"] as? String, "A")
        XCTAssertTrue(obj["requiredAttendanceRate"] is NSNull, "nil は null として送る (消せる)")
        XCTAssertEqual(obj["maxAbsences"] as? Int, 5)
        XCTAssertTrue(obj["tardiesPerAbsence"] is NSNull)
        XCTAssertNil(obj["rule"], "rule というキー自体は JSON に出さない")
    }

    func testB25bRuleNoneSendsThreeNulls() throws {
        let obj = try encodeToObject(CourseUpdateInput(rule: CourseRuleValues.none))
        XCTAssertEqual(Set(obj.keys), ["requiredAttendanceRate", "maxAbsences", "tardiesPerAbsence"])
        for k in ["requiredAttendanceRate", "maxAbsences", "tardiesPerAbsence"] {
            XCTAssertTrue(obj[k] is NSNull, "\(k) は null")
        }
    }

    func testB25cRuleWithAllValuesAndOtherFields() throws {
        let input = CourseUpdateInput(
            name: "N", teacher: "T", color: "#112233", note: "memo",
            rule: CourseRuleValues(requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3)
        )
        let obj = try encodeToObject(input)
        XCTAssertEqual(
            Set(obj.keys),
            ["name", "teacher", "color", "note", "requiredAttendanceRate", "maxAbsences", "tardiesPerAbsence"]
        )
        XCTAssertEqual(obj["requiredAttendanceRate"] as? Int, 80)
        XCTAssertEqual(obj["maxAbsences"] as? Int, 4)
        XCTAssertEqual(obj["tardiesPerAbsence"] as? Int, 3)
        XCTAssertEqual(obj["teacher"] as? String, "T")
    }

    func testB26RuleNilSendsOnlyPresentKeys() throws {
        let obj = try encodeToObject(CourseUpdateInput(name: "A"))
        XCTAssertEqual(Set(obj.keys), ["name"])
    }

    func testB26bRuleNilDoesNotSendRuleKeysEvenWithOtherFields() throws {
        let obj = try encodeToObject(CourseUpdateInput(name: "A", teacher: "T"))
        XCTAssertEqual(Set(obj.keys), ["name", "teacher"])
    }

    func testCourseCreateInputOmitsNilRuleKeysAndSendsSetOnes() throws {
        var input = CourseCreateInput(userTimetableId: "ut", name: "X", teacher: nil, color: nil, note: nil)
        var obj = try encodeToObject(input)
        XCTAssertNil(obj["requiredAttendanceRate"])
        XCTAssertNil(obj["maxAbsences"])
        XCTAssertNil(obj["tardiesPerAbsence"])
        input.maxAbsences = 4
        input.tardiesPerAbsence = 3
        obj = try encodeToObject(input)
        XCTAssertEqual(obj["maxAbsences"] as? Int, 4)
        XCTAssertEqual(obj["tardiesPerAbsence"] as? Int, 3)
        XCTAssertNil(obj["requiredAttendanceRate"])
    }

    // MARK: B27 CourseStatsDto の decode

    func testB27Build20ShapeDecodesWithNilNewFields() throws {
        let s = try stats()
        XCTAssertNil(s.requiredAttendanceRate)
        XCTAssertNil(s.rule)
        XCTAssertNil(s.remainingLessons)
        XCTAssertNil(s.absenceLessons)
        XCTAssertNil(s.allowedAbsenceLessons)
        XCTAssertNil(s.limitedBy)
        XCTAssertEqual(s.allowedAbsences, 4)
    }

    func testB27NewShapeDecodes() throws {
        let s = try stats(extra: """
        , "requiredAttendanceRate": 80,
          "rule": {"requiredAttendanceRate": 80, "maxAbsences": 4, "tardiesPerAbsence": null},
          "remainingLessons": 12, "absenceLessons": 1.75, "allowedAbsenceLessons": 1, "limitedBy": "rate"
        """)
        XCTAssertEqual(s.requiredAttendanceRate, 80)
        XCTAssertEqual(s.rule, CourseRuleValues(requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: nil))
        XCTAssertEqual(s.remainingLessons, 12)
        XCTAssertEqual(try XCTUnwrap(s.absenceLessons), 1.75, accuracy: 1e-9)
        XCTAssertEqual(s.allowedAbsenceLessons, 1)
        XCTAssertEqual(s.limitedBy, "rate")
    }

    func testB27NullNewFieldsDecode() throws {
        let s = try stats(extra: """
        , "requiredAttendanceRate": 70,
          "rule": {"requiredAttendanceRate": null, "maxAbsences": null, "tardiesPerAbsence": null},
          "remainingLessons": 14, "absenceLessons": null, "allowedAbsenceLessons": null, "limitedBy": null
        """)
        XCTAssertEqual(s.rule, CourseRuleValues.none)
        XCTAssertNil(s.absenceLessons)
        XCTAssertNil(s.allowedAbsenceLessons)
        XCTAssertNil(s.limitedBy)
    }

    func testB27UnknownLimitedByDoesNotBreakDecode() throws {
        let s = try stats(extra: #", "allowedAbsenceLessons": 2, "limitedBy": "future""#)
        XCTAssertEqual(s.limitedBy, "future")
    }

    func testCourseDtoDecodesWithAndWithoutRuleKeys() throws {
        let old = Data(#"{"id":"c","userTimetableId":"u","name":"A","teacher":null,"color":"#ffffff","note":null}"#.utf8)
        let a = try JSONDecoder().decode(CourseDto.self, from: old)
        XCTAssertNil(a.requiredAttendanceRate)
        XCTAssertNil(a.maxAbsences)
        XCTAssertNil(a.tardiesPerAbsence)
        let new = Data(#"{"id":"c","userTimetableId":"u","name":"A","teacher":null,"color":"#ffffff","note":null,"requiredAttendanceRate":80,"maxAbsences":null,"tardiesPerAbsence":3}"#.utf8)
        let b = try JSONDecoder().decode(CourseDto.self, from: new)
        XCTAssertEqual(b.requiredAttendanceRate, 80)
        XCTAssertNil(b.maxAbsences)
        XCTAssertEqual(b.tardiesPerAbsence, 3)
    }

    // MARK: B28-B33 courseActionText / Color

    func testB28NilLessonsDelegatesToLegacyThreeArgVersion() throws {
        let s = try stats()
        XCTAssertNil(s.allowedAbsenceLessons)
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.courseActionText(stats: s),
            SemesterOverviewDisplayLogic.courseActionText(
                allowedAbsences: s.allowedAbsences,
                remainingCount: s.remainingCount,
                allowedAbsenceDays: s.allowedAbsenceDays
            )
        )
        XCTAssertEqual(
            SemesterOverviewDisplayLogic.courseActionColor(stats: s),
            SemesterOverviewDisplayLogic.courseActionColor(allowedAbsences: s.allowedAbsences, remainingCount: s.remainingCount)
        )
    }

    func testB29NegativeCountLimited() throws {
        let s = try lessonStats(allowedAbsenceLessons: -1, remainingLessons: 5, limitedBy: "count")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionText(stats: s), "欠席上限を超えています")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionColor(stats: s), .statusAbsent)
    }

    func testB30NegativeRateLimited() throws {
        let s = try lessonStats(allowedAbsenceLessons: -1, remainingLessons: 5, limitedBy: "rate")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionText(stats: s), "下回る見込み")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionColor(stats: s), .statusAbsent)
    }

    func testB31AllowedAtLeastRemainingIsAllSkipOK() throws {
        let s = try lessonStats(allowedAbsenceLessons: 5, remainingLessons: 3, limitedBy: "count")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionText(stats: s), "残り全休OK")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionColor(stats: s), .accent)
    }

    func testB31bBoundaryAllowedEqualsRemaining() throws {
        let s = try lessonStats(allowedAbsenceLessons: 3, remainingLessons: 3, limitedBy: "count")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionText(stats: s), "残り全休OK")
    }

    func testB32ZeroWithRemaining() throws {
        let s = try lessonStats(allowedAbsenceLessons: 0, remainingLessons: 10, limitedBy: "count")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionText(stats: s), "あと0回休める")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionColor(stats: s), .textTertiary)
    }

    func testB33TwoOfNine() throws {
        let s = try lessonStats(allowedAbsenceLessons: 2, remainingLessons: 9, limitedBy: "count")
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionText(stats: s), "あと2回休める")
    }

    func testRemainingLessonsNilTreatedAsZero() throws {
        let s = try lessonStats(allowedAbsenceLessons: 0, remainingLessons: nil, limitedBy: "count")
        // L(0) >= R(0) → 残り全休OK (設計: R = remainingLessons ?? 0)
        XCTAssertEqual(SemesterOverviewDisplayLogic.courseActionText(stats: s), "残り全休OK")
    }

    // MARK: B34 requiredRate

    func testB34RequiredRateUsesStatsThenFallback() throws {
        var s = try stats()
        s.requiredAttendanceRate = 80
        XCTAssertEqual(SemesterOverviewDisplayLogic.requiredRate(stats: s, fallback: 70), 80)
        s.requiredAttendanceRate = nil
        XCTAssertEqual(SemesterOverviewDisplayLogic.requiredRate(stats: s, fallback: 70), 70)
    }

    // MARK: B35 summary

    func testB35SummaryExamples() {
        XCTAssertEqual(
            CourseRuleLogic.summary(rule: CourseRuleValues(requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: nil), userRate: 70),
            "出席率 80% ・ 欠席 4 回まで"
        )
        XCTAssertEqual(
            CourseRuleLogic.summary(rule: CourseRuleValues(requiredAttendanceRate: nil, maxAbsences: nil, tardiesPerAbsence: 3), userRate: 70),
            "共通（70%） ・ 遅刻・早退 3 回で欠席 1 回"
        )
        XCTAssertEqual(CourseRuleLogic.summary(rule: .none, userRate: 70), "共通（70%）")
    }

    func testB35bSummaryAllThreeAndUserRateFollows() {
        XCTAssertEqual(
            CourseRuleLogic.summary(rule: CourseRuleValues(requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3), userRate: 70),
            "出席率 80% ・ 欠席 4 回まで ・ 遅刻・早退 3 回で欠席 1 回"
        )
        XCTAssertEqual(CourseRuleLogic.summary(rule: .none, userRate: 85), "共通（85%）")
        // 率だけ / 上限だけ では共通を付けない
        XCTAssertEqual(
            CourseRuleLogic.summary(rule: CourseRuleValues(requiredAttendanceRate: 60, maxAbsences: nil, tardiesPerAbsence: nil), userRate: 70),
            "出席率 60%"
        )
        XCTAssertEqual(
            CourseRuleLogic.summary(rule: CourseRuleValues(requiredAttendanceRate: nil, maxAbsences: 0, tardiesPerAbsence: nil), userRate: 70),
            "欠席 0 回まで"
        )
    }

    // MARK: B36 footnote

    func testB36FootnoteTable() {
        XCTAssertEqual(
            CourseRuleLogic.footnote(rateOn: false, maxOn: false, userRate: 70),
            "未設定の項目は共通の必要出席率（70%）で判定します"
        )
        XCTAssertEqual(
            CourseRuleLogic.footnote(rateOn: true, maxOn: false, userRate: 70, rate: 80),
            "この科目は 80% で判定します"
        )
        XCTAssertEqual(
            CourseRuleLogic.footnote(rateOn: false, maxOn: true, userRate: 70),
            "この科目は回数の上限で判定します（共通の必要出席率は使いません）"
        )
        XCTAssertEqual(
            CourseRuleLogic.footnote(rateOn: true, maxOn: true, userRate: 70, rate: 80),
            "出席率と回数の厳しい方で「あと何回休めるか」を出します"
        )
    }

    func testB36bFootnoteUserRateIsInterpolated() {
        XCTAssertEqual(
            CourseRuleLogic.footnote(rateOn: false, maxOn: false, userRate: 85),
            "未設定の項目は共通の必要出席率（85%）で判定します"
        )
    }
}
