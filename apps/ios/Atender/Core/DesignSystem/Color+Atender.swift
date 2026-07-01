import SwiftUI
import UIKit

extension Color {
    static func dynamic(dark: UIColor, light: UIColor) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }

    static let bgBase = dynamic(dark: UIColor(hex: 0x0B0E14), light: UIColor(hex: 0xF9F9F9))
    static let bgMuted = dynamic(dark: UIColor(hex: 0x14181F), light: UIColor(hex: 0xF2F2F2))
    static let bgElevated = dynamic(dark: UIColor(hex: 0x1A1F2A), light: UIColor(hex: 0xFFFFFF))
    static let bgOverlay = dynamic(dark: .black.withAlphaComponent(0.72), light: UIColor.hex(0x0F172A, 0.40))

    static let textPrimary = dynamic(dark: UIColor(hex: 0xF5F6F8), light: UIColor(hex: 0x0F172A))
    static let textSecondary = dynamic(dark: UIColor.hex(0xF5F6F8, 0.72), light: UIColor.hex(0x0F172A, 0.72))
    static let textTertiary = dynamic(dark: UIColor.hex(0xF5F6F8, 0.52), light: UIColor.hex(0x0F172A, 0.58))
    static let textOnAccent = Color.white
    static let textOnDanger = Color.white

    static let borderSubtle = dynamic(dark: UIColor.white.withAlphaComponent(0.06), light: UIColor.hex(0x0F172A, 0.08))
    static let borderDefault = dynamic(dark: UIColor.white.withAlphaComponent(0.12), light: UIColor.hex(0x0F172A, 0.14))
    static let borderEmphasis = dynamic(dark: UIColor.white.withAlphaComponent(0.28), light: UIColor.hex(0x0F172A, 0.30))
    static let borderSettings = dynamic(dark: UIColor.white.withAlphaComponent(0.12), light: UIColor.hex(0x0F172A, 0.08))

    static let accent50 = dynamic(dark: UIColor.hex(0xF97316, 0.12), light: UIColor.hex(0xEA580C, 0.10))
    static let accent100 = dynamic(dark: UIColor.hex(0xF97316, 0.20), light: UIColor.hex(0xEA580C, 0.18))
    static let accent500 = dynamic(dark: UIColor(hex: 0xF97316), light: UIColor(hex: 0xEA580C))
    static let accent600 = dynamic(dark: UIColor(hex: 0xFB923C), light: UIColor(hex: 0xC2410C))
    static let accent700 = dynamic(dark: UIColor(hex: 0xFDBA74), light: UIColor(hex: 0x9A3412))
    static let accent = accent500

    static let statusPresent = dynamic(dark: UIColor(hex: 0x34D399), light: UIColor(hex: 0x16A34A))
    static let statusAbsent = dynamic(dark: UIColor(hex: 0xFF5C7A), light: UIColor(hex: 0xDC2626))
    static let statusExcused = dynamic(dark: UIColor(hex: 0x5AA9FF), light: UIColor(hex: 0x2563EB))
    static let statusTardy = dynamic(dark: UIColor(hex: 0xFFC93C), light: UIColor(hex: 0xD97706))
    static let statusEarly = dynamic(dark: UIColor(hex: 0xC685FF), light: UIColor(hex: 0x9333EA))
    static let statusCancelled = dynamic(dark: UIColor.white.withAlphaComponent(0.30), light: UIColor.hex(0x0F172A, 0.40))
    static let statusSuspended = dynamic(dark: UIColor(hex: 0x94A3B8), light: UIColor(hex: 0x64748B))
    static let statusNone = dynamic(dark: UIColor.white.withAlphaComponent(0.18), light: UIColor.hex(0x0F172A, 0.18))

    static let friendshipPending = dynamic(dark: UIColor(hex: 0xFFC93C), light: UIColor(hex: 0xD97706))
    static let friendshipAccepted = dynamic(dark: UIColor(hex: 0x34D399), light: UIColor(hex: 0x16A34A))
    static let friendshipBlocked = dynamic(dark: UIColor(hex: 0xFF5C7A), light: UIColor(hex: 0xDC2626))

    static let roomEvent = dynamic(dark: UIColor(hex: 0xC685FF), light: UIColor(hex: 0x9333EA))
    static let roomAvailabilityEmpty = dynamic(dark: UIColor.hex(0xF97316, 0.16), light: UIColor.hex(0xEA580C, 0.14))
    static let eventMixTarget = dynamic(dark: UIColor.white, light: UIColor.black)

    static func forStatus(_ status: AttendanceStatus?) -> Color {
        switch status {
        case .present: return .statusPresent
        case .absent: return .statusAbsent
        case .excused: return .statusExcused
        case .tardy: return .statusTardy
        case .earlyLeave: return .statusEarly
        case .cancelled: return .statusCancelled
        case .unknown, .none: return .statusNone
        }
    }

    static func forDayStatus(_ status: AttendanceDayStatus) -> Color {
        switch status {
        case .allPresent: return .statusPresent
        case .hasAbsent: return .statusAbsent
        case .hasTardy: return .statusTardy
        case .allSuspended: return .statusSuspended
        case .partialUnrecorded: return .statusNone
        case .noClass, .unknown: return .bgMuted
        }
    }

    static func forFriendship(_ status: FriendshipStatus) -> Color {
        switch status {
        case .pending: return .friendshipPending
        case .accepted: return .friendshipAccepted
        case .blocked: return .friendshipBlocked
        case .declined, .unknown: return .statusNone
        }
    }

    static func forRoomEvent() -> Color {
        .roomEvent
    }

    static func forRate(pct: Int?, required: Int) -> Color {
        guard let pct else { return .textTertiary }
        return pct >= required ? .accent : .statusAbsent
    }
}

extension UIColor {
    convenience init(hex: Int) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }

    static func hex(_ value: Int, _ alpha: CGFloat) -> UIColor {
        UIColor(hex: value).withAlphaComponent(alpha)
    }
}
