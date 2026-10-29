// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §7.2 / §7.4 / §8 ST
import UIKit
import XCTest
@testable import Atender

final class CalendarSyncStatusTests: XCTestCase {

    func testST7MessageTable() {
        let table: [(CalendarSyncError, String, CalendarSyncRecovery)] = [
            (.accessNotDetermined, "カレンダーへのアクセスが許可されていません", .requestAccess),
            (.accessDenied, "設定 > Atender でカレンダーへのアクセスを許可してください", .openSystemSettings),
            (.accessRestricted, "この端末ではカレンダーを利用できません", .none),
            (.accessWriteOnly, "書き出しにはカレンダーのフルアクセスが必要です", .requestAccess),
            (.noWritableSource, "書き込めるカレンダーアカウントが見つかりません", .none),
            (.calendarCreateFailed("EKErrorSourceDoesNotAllowCalendarAddDelete"),
             "Atender カレンダーを作成できませんでした（EKErrorSourceDoesNotAllowCalendarAddDelete）", .retry),
            (.calendarReadOnly, "Atender カレンダーが読み取り専用になっています", .none),
            (.calendarLookupTransient, "カレンダーを読み込めませんでした", .retry),
            (.identityUnavailable, "この端末では書き出しを続けられません（イベントの識別情報が保持されません）", .none),
            (.applyFailed("boom"), "iPhone カレンダーに書き込めませんでした（boom）", .retry),
            (.network("timeout"), "時間割を取得できませんでした（timeout）", .retry),
        ]
        XCTAssertEqual(table.count, 11)
        for (error, message, recovery) in table {
            XCTAssertEqual(error.message, message, "[ST7] \(error)")
            XCTAssertEqual(error.recovery, recovery, "[ST7] \(error)")
        }
        XCTAssertTrue(
            CalendarSyncError.calendarCreateFailed("EKErrorSourceDoesNotAllowCalendarAddDelete")
                .message.contains("EKErrorSourceDoesNotAllowCalendarAddDelete")
        )
    }

    func testST8RecoveryNoneCases() {
        let noneCases: [CalendarSyncError] = [.accessRestricted, .noWritableSource, .calendarReadOnly, .identityUnavailable]
        for error in noneCases {
            XCTAssertEqual(error.recovery, .none, "[ST8] \(error)")
        }
    }

    func testST9SFSymbolsExist() {
        for name in ["checkmark.circle.fill", "exclamationmark.triangle.fill", "calendar.badge.plus"] {
            XCTAssertNotNil(UIImage(systemName: name), "[ST9] \(name)")
        }
        XCTAssertNil(UIImage(systemName: "definitely.not.a.symbol"), "[ST9] 負の対照")
    }
}
