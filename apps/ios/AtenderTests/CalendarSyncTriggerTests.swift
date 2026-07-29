// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §5.5 / §8 TR
import XCTest
@testable import Atender

final class CalendarSyncTriggerTests: XCTestCase {
    // 2026-07-23T12:00:00Z (エポックを手計算しない — role note 83)
    private let now: Date = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: "2026-07-23T12:00:00Z")!
    }()

    private func shouldRun(
        _ trigger: SyncTrigger,
        lastRunAt: Date? = nil,
        lastSelfWriteAt: Date? = nil,
        isRunning: Bool = false
    ) -> Bool {
        CalendarSyncTrigger.shouldRun(
            trigger: trigger, now: now,
            lastRunAt: lastRunAt, lastSelfWriteAt: lastSelfWriteAt,
            isRunning: isRunning
        )
    }

    private func ago(_ seconds: TimeInterval) -> Date { now.addingTimeInterval(-seconds) }

    func testTRAReentrancyIsBlocked() {
        let triggers: [SyncTrigger] = [.appLaunch, .foreground, .storeChanged, .permissionGranted, .calendarScreen, .dataChanged, .manual]
        for trigger in triggers {
            XCTAssertFalse(shouldRun(trigger, isRunning: true), "[TR-A] \(trigger)")
        }
    }

    func testTRBFirstRun() {
        XCTAssertTrue(shouldRun(.foreground, lastRunAt: nil))
    }

    func testTRCThrottle() {
        XCTAssertFalse(shouldRun(.foreground, lastRunAt: ago(5)))
        XCTAssertTrue(shouldRun(.foreground, lastRunAt: ago(20)))
    }

    func testTRDThrottleBypass() {
        for trigger in [SyncTrigger.manual, .appLaunch, .permissionGranted] {
            XCTAssertTrue(shouldRun(trigger, lastRunAt: ago(1)), "[TR-D] \(trigger)")
            XCTAssertTrue(trigger.bypassesThrottle, "[TR-D] bypassesThrottle \(trigger)")
        }
        XCTAssertFalse(SyncTrigger.foreground.bypassesThrottle)
        XCTAssertFalse(SyncTrigger.storeChanged.bypassesThrottle)
        XCTAssertFalse(SyncTrigger.calendarScreen.bypassesThrottle)
        XCTAssertFalse(SyncTrigger.dataChanged.bypassesThrottle)
    }

    func testTRESelfWriteEchoIsIgnored() {
        XCTAssertFalse(shouldRun(.storeChanged, lastRunAt: nil, lastSelfWriteAt: ago(1)))
        XCTAssertTrue(shouldRun(.storeChanged, lastRunAt: nil, lastSelfWriteAt: ago(5)))
        XCTAssertFalse(shouldRun(.storeChanged, lastRunAt: ago(5), lastSelfWriteAt: ago(5)))
    }

    func testTRFSelfWriteDoesNotBlockOtherTriggers() {
        XCTAssertTrue(shouldRun(.manual, lastRunAt: nil, lastSelfWriteAt: ago(1)))
    }

    func testTRGIsDataChange() {
        let positives: [[QueryKey]] = [
            [.personalEvents()],
            [.userTimetables()],
            [.timetableSuspensions()],
            [.semesters()],
            [.semesterOverview("s1")],
            [.courseSuspensions("c1")],
            [QueryKey(["today"]), .personalEvents()],
        ]
        for keys in positives {
            XCTAssertTrue(CalendarSyncTrigger.isDataChange(keys), "[TR-G] \(keys)")
        }
        let negatives: [[QueryKey]] = [
            [.dayPrefix()],
            [QueryKey(["rooms"])],
            [QueryKey(["today"])],
            [QueryKey(["stats"])],
            [],
        ]
        for keys in negatives {
            XCTAssertFalse(CalendarSyncTrigger.isDataChange(keys), "[TR-G] \(keys)")
        }
    }

    func testTRConstants() {
        XCTAssertEqual(CalendarSyncTrigger.throttle, 15)
        XCTAssertEqual(CalendarSyncTrigger.selfWriteQuietPeriod, 3)
        XCTAssertEqual(CalendarSyncTrigger.storeChangedDebounce, 1)
    }

    // §4.3 ExportWindow — 今日アンカーで相対に検証する (リテラル日付は実行日で腐る)
    func testEW1WindowIsTodayMinus31ToTodayPlus334() {
        let today = SchoolClock.todayString()
        let window = ExportWindow.around(today: today)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let todayDate = formatter.date(from: today)!
        XCTAssertEqual(window.from, formatter.string(from: calendar.date(byAdding: .day, value: -31, to: todayDate)!))
        XCTAssertEqual(window.to, formatter.string(from: calendar.date(byAdding: .day, value: 334, to: todayDate)!))
    }
}
