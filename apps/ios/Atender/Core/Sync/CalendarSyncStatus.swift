import Foundation

enum EventKitAccess: String, Equatable, Sendable {
    case notDetermined, denied, restricted, writeOnly, fullAccess
}

enum CalendarSyncError: Equatable, Error, Sendable {
    case accessNotDetermined
    case accessDenied
    case accessRestricted
    case accessWriteOnly
    case noWritableSource
    case calendarCreateFailed(String)     // EKError の localizedDescription 逐語
    case calendarReadOnly
    case calendarLookupTransient          // fullAccess なのにカレンダー 0 件 (ソース未ロード)
    case identityUnavailable              // §4.1 の read-back 検証に失敗
    case applyFailed(String)
    case network(String)

    /// §7.4 の表が正典
    var message: String {
        switch self {
        case .accessNotDetermined: return "カレンダーへのアクセスが許可されていません"
        case .accessDenied: return "設定 > Atender でカレンダーへのアクセスを許可してください"
        case .accessRestricted: return "この端末ではカレンダーを利用できません"
        case .accessWriteOnly: return "書き出しにはカレンダーのフルアクセスが必要です"
        case .noWritableSource: return "書き込めるカレンダーアカウントが見つかりません"
        case .calendarCreateFailed(let detail): return "Atender カレンダーを作成できませんでした（\(detail)）"
        case .calendarReadOnly: return "Atender カレンダーが読み取り専用になっています"
        case .calendarLookupTransient: return "カレンダーを読み込めませんでした"
        case .identityUnavailable: return "この端末では書き出しを続けられません（イベントの識別情報が保持されません）"
        case .applyFailed(let detail): return "iPhone カレンダーに書き込めませんでした（\(detail)）"
        case .network(let detail): return "予定を取得できませんでした（\(detail)）"
        }
    }

    var recovery: CalendarSyncRecovery {
        switch self {
        case .accessNotDetermined, .accessWriteOnly: return .requestAccess
        case .accessDenied: return .openSystemSettings
        case .accessRestricted, .noWritableSource, .calendarReadOnly, .identityUnavailable: return .none
        case .calendarCreateFailed, .calendarLookupTransient, .applyFailed, .network: return .retry
        }
    }
}

enum CalendarSyncRecovery: Equatable, Sendable {
    case none                 // ボタンを出さない
    case requestAccess        // 「許可する」→ requestFullAccess()
    case openSystemSettings   // 「設定を開く」→ UIApplication.openSettingsURLString
    case retry                // 「もう一度」→ sync(trigger: .manual)

    /// §7.4 のボタン文言。`.none` は空文字
    var buttonTitle: String {
        switch self {
        case .none: return ""
        case .requestAccess: return "許可する"
        case .openSystemSettings: return "設定を開く"
        case .retry: return "もう一度"
        }
    }
}

struct ExportSummary: Equatable, Sendable {
    var created: Int = 0
    var updated: Int = 0
    var deleted: Int = 0
    var unchanged: Int = 0
    /// Atender カレンダー内にある「我々が書いていない」イベント数
    var foreign: Int = 0
}

enum CalendarSyncPhase: Equatable, Sendable { case idle, running, succeeded, failed }

struct CalendarSyncStatus: Equatable, Sendable {
    var phase: CalendarSyncPhase = .idle
    var access: EventKitAccess = .notDetermined
    var lastSuccessAt: Date? = nil
    var lastSummary: ExportSummary? = nil
    var lastError: CalendarSyncError? = nil
    /// 解決済みカレンダーの表示名 (title + source)
    var calendarTitle: String? = nil
}

// MARK: - カレンダー画面のバナー (§7.2)

enum CalendarSyncBannerKind: Equatable {
    case none
    case permissionPrompt                 // 未決定 + 書き出し ON + 未 dismiss
    case failure(CalendarSyncError)
}

enum CalendarSyncBannerLogic {
    static func kind(status: CalendarSyncStatus, exportEnabled: Bool, promptDismissed: Bool) -> CalendarSyncBannerKind {
        if !exportEnabled { return .none }
        if status.access == .notDetermined {
            return promptDismissed ? .none : .permissionPrompt
        }
        if status.phase == .failed, let error = status.lastError {
            // ユーザーが明示的に断った状態を毎回蒸し返さない
            if error == .accessDenied { return .none }
            if error == .accessRestricted { return .none }
            return .failure(error)
        }
        return .none
    }
}
