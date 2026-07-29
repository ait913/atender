// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §7.2 / §7.4 / §8 ST
import UIKit
import XCTest
@testable import Atender

final class CalendarSyncStatusTests: XCTestCase {
    private func status(
        access: EventKitAccess,
        phase: CalendarSyncPhase = .idle,
        lastError: CalendarSyncError? = nil
    ) -> CalendarSyncStatus {
        var value = CalendarSyncStatus()
        value.access = access
        value.phase = phase
        value.lastError = lastError
        return value
    }

    private func kind(
        _ status: CalendarSyncStatus,
        exportEnabled: Bool = true,
        promptDismissed: Bool = false
    ) -> CalendarSyncBannerKind {
        CalendarSyncBannerLogic.kind(status: status, exportEnabled: exportEnabled, promptDismissed: promptDismissed)
    }

    func testST1ExportDisabledShowsNothing() {
        XCTAssertEqual(kind(status(access: .notDetermined), exportEnabled: false), .none)
    }

    func testST2NotDeterminedShowsPermissionPrompt() {
        XCTAssertEqual(kind(status(access: .notDetermined)), .permissionPrompt)
    }

    func testST3DismissedPromptShowsNothing() {
        XCTAssertEqual(kind(status(access: .notDetermined), promptDismissed: true), .none)
    }

    func testST4FailureBanner() {
        let value = status(access: .fullAccess, phase: .failed, lastError: .applyFailed("x"))
        XCTAssertEqual(kind(value), .failure(.applyFailed("x")))
    }

    func testST5DeniedAndRestrictedAreNotRepeated() {
        XCTAssertEqual(kind(status(access: .denied, phase: .failed, lastError: .accessDenied)), .none)
        XCTAssertEqual(kind(status(access: .restricted, phase: .failed, lastError: .accessRestricted)), .none)
    }

    func testST6NonFailedPhasesShowNothing() {
        XCTAssertEqual(kind(status(access: .fullAccess, phase: .succeeded, lastError: .applyFailed("x"))), .none)
        XCTAssertEqual(kind(status(access: .fullAccess, phase: .running, lastError: .applyFailed("x"))), .none)
    }

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
            (.network("timeout"), "予定を取得できませんでした（timeout）", .retry),
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
