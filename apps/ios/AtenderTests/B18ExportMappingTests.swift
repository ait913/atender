// build 18 設計 §5.1/§5.2/§8.2 (#E1-#E6) — 公欠 (EXCUSED) を EventKit 書き出しから除外。
// Reviewer 生成 (設計docのみを根拠、実装は未読)。既存 CourseExportMappingTests (MC1-MC15) には触れない。
import XCTest
@testable import Atender

final class B18ExportMappingTests: XCTestCase {

    // MARK: - fixtures (CourseExportMappingTests と同じ形)

    private func occurrence(
        id: String = "o1", meetingId: String = "mt1", courseId: String = "c1",
        courseName: String = "情報数学", teacher: String? = "山田", room: String? = "301",
        date: String = "2026-07-23", periodIndex: Int, periodOffset: Int,
        startMinute: Int, endMinute: Int, status: AttendanceStatus? = nil
    ) -> OccurrenceDto {
        OccurrenceDto(
            id: id, meetingId: meetingId, courseId: courseId, courseName: courseName,
            teacher: teacher, room: room, color: nil, date: date,
            periodIndex: periodIndex, periodOffset: periodOffset,
            startMinute: startMinute, endMinute: endMinute, status: status
        )
    }

    private func items(_ occurrences: [OccurrenceDto]) -> [ExportItem] {
        CourseExportMapping.items(occurrences: occurrences, courseSuspensions: [], timetableSuspensions: [])
    }

    // MARK: - #E1

    func testE1ExcludedStatusesIsCancelledAndExcused() {
        XCTAssertEqual(CourseExportMapping.excludedStatuses, [.cancelled, .excused],
                        "[#E1] excludedStatuses が {cancelled, excused} でない")
    }

    // MARK: - #E2 / #E5 (同じ経路であることの対)

    func testE2ExcusedOccurrenceProducesNoItem() {
        let excused = occurrence(periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630, status: .excused)
        XCTAssertEqual(items([excused]), [], "[#E2] status: .excused が除外されていない")
    }

    /// [#E5] .cancelled も同じ経路で除外される (excludedStatuses が単一のセットで両方を決めている証拠)
    func testE5CancelledAloneAlsoProducesNoItem() {
        let cancelled = occurrence(periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630, status: .cancelled)
        XCTAssertEqual(items([cancelled]), [], "[#E5] status: .cancelled (build 17 からの既存除外) が空にならない")
    }

    // MARK: - #E3

    func testE3ExcusedOffsetSplitsRunFromRemainingOffset() {
        let excusedFirst = occurrence(id: "o1", periodIndex: 3, periodOffset: 0, startMinute: 780, endMinute: 870, status: .excused)
        let presentSecond = occurrence(id: "o2", periodIndex: 4, periodOffset: 1, startMinute: 880, endMinute: 970, status: .present)
        let result = items([excusedFirst, presentSecond])

        XCTAssertEqual(result.count, 1, "[#E3] 除外後に残る item は1件のはず")
        XCTAssertEqual(result[0].notes, "4限\n担当: 山田", "[#E3] notes が offset1 だけの時限になっていない")
        XCTAssertEqual(result[0].start, jstDate("2026-07-23T14:40:00"), "[#E3] start が offset1 の startMinute (880分) でない")
    }

    // MARK: - #E4

    func testE4NonExcludedStatusesAllRemain() {
        // 別 Meeting にする: 同一 Meeting の連続コマは 1 item に束ねられる仕様 (build 12 §5.2) なので、
        // 「除外されていない」を item 数で見るには meeting を分ける必要がある (Leader 修正 2026-09-08)
        let absent = occurrence(id: "o1", meetingId: "mt1", periodIndex: 1, periodOffset: 0, startMinute: 540, endMinute: 630, status: .absent)
        let tardy = occurrence(id: "o2", meetingId: "mt2", periodIndex: 2, periodOffset: 0, startMinute: 640, endMinute: 730, status: .tardy)
        let earlyLeave = occurrence(id: "o3", meetingId: "mt3", periodIndex: 3, periodOffset: 0, startMinute: 780, endMinute: 870, status: .earlyLeave)
        let none = occurrence(id: "o4", meetingId: "mt4", periodIndex: 4, periodOffset: 0, startMinute: 880, endMinute: 970, status: nil)

        let result = items([absent, tardy, earlyLeave, none])
        XCTAssertEqual(result.count, 4, "[#E4] absent/tardy/earlyLeave/nil のいずれかが誤って除外されている")
    }

    // MARK: - #E6 (配線の不変・回帰防止)

    func testE6SyncWiringIsUnchanged() {
        XCTAssertTrue(CalendarSyncTrigger.isDataChange([QueryKey(["semesters"])]),
                       "[#E6] semesters が isDataChange の対象から外れている")
        XCTAssertTrue(invalidationTargets(for: .patchAttendance).contains(.semesters()),
                       "[#E6] patchAttendance の invalidation に semesters が含まれない")
        XCTAssertEqual(CalendarSyncTrigger.throttle, 15, "[#E6] throttle が15秒でない")
    }

    func testE6ThrottleSamplePoints() {
        let t: Date = {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime]
            return f.date(from: "2026-09-08T12:00:00Z")!
        }()

        XCTAssertFalse(
            CalendarSyncTrigger.shouldRun(trigger: .dataChanged, now: t, lastRunAt: t.addingTimeInterval(-14), lastSelfWriteAt: nil, isRunning: false),
            "[#E6] T-14秒はまだ throttle 窓の内側のはず"
        )
        XCTAssertTrue(
            CalendarSyncTrigger.shouldRun(trigger: .dataChanged, now: t, lastRunAt: t.addingTimeInterval(-15), lastSelfWriteAt: nil, isRunning: false),
            "[#E6] T-15秒は throttle 窓の境界外のはず"
        )
        XCTAssertTrue(
            CalendarSyncTrigger.shouldRun(trigger: .appLaunch, now: t, lastRunAt: t.addingTimeInterval(-1), lastSelfWriteAt: nil, isRunning: false),
            "[#E6] appLaunch は throttle をバイパスするはず"
        )
    }
}
