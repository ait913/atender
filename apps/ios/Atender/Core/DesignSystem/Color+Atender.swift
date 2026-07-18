import SwiftUI
import UIKit

extension Color {
    static func dynamic(dark: UIColor, light: UIColor) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }

    static let bgBase = Color(uiColor: .systemGroupedBackground)
    static let bgMuted = Color(uiColor: .tertiarySystemGroupedBackground)
    static let bgElevated = Color(uiColor: .secondarySystemGroupedBackground)
    static let bgOverlay = Color(uiColor: .systemFill)

    static let textPrimary = Color(uiColor: .label)
    static let textSecondary = Color(uiColor: .secondaryLabel)
    static let textTertiary = Color(uiColor: .tertiaryLabel)
    static let textOnAccent = Color.white
    static let textOnDanger = Color.white

    static let borderSubtle = Color(uiColor: .separator)
    static let borderDefault = Color(uiColor: .separator)
    static let borderEmphasis = Color(uiColor: .opaqueSeparator)
    static let borderSettings = Color(uiColor: .separator)

    // accent = 水色 azure (#2E8CFF を少しシアン側へ / light 基準)
    static let accent50 = dynamic(dark: UIColor.hex(0x3DA9F0, 0.12), light: UIColor.hex(0x1E96E6, 0.10))
    static let accent100 = dynamic(dark: UIColor.hex(0x3DA9F0, 0.20), light: UIColor.hex(0x1E96E6, 0.18))
    static let accent500 = dynamic(dark: UIColor(hex: 0x3DA9F0), light: UIColor(hex: 0x1E96E6))
    static let accent600 = dynamic(dark: UIColor(hex: 0x63BEF5), light: UIColor(hex: 0x147FCC))
    static let accent700 = dynamic(dark: UIColor(hex: 0x90D2F8), light: UIColor(hex: 0x0F6399))
    static let accent = accent500

    // 軽いグラデ (accent ボタン・FAB・出席率リング等の要所のみ)
    static let accentGradient = LinearGradient(
        colors: [
            Color.dynamic(dark: UIColor(hex: 0x4FB4F6), light: UIColor(hex: 0x37A8F0)),
            Color.dynamic(dark: UIColor(hex: 0x2E90DE), light: UIColor(hex: 0x147FCC)),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    // status (出席状態) — 中間彩度
    static let statusPresent = dynamic(dark: UIColor(hex: 0x34D8A0), light: UIColor(hex: 0x12B172))
    static let statusAbsent = dynamic(dark: UIColor(hex: 0xFF6384), light: UIColor(hex: 0xF0435F))
    static let statusExcused = dynamic(dark: UIColor(hex: 0x6BA3FF), light: UIColor(hex: 0x4C82F5))
    static let statusTardy = dynamic(dark: UIColor(hex: 0xFFC93C), light: UIColor(hex: 0xF59E28))
    static let statusEarly = dynamic(dark: UIColor(hex: 0xB98BFF), light: UIColor(hex: 0x9E5AEE))
    static let statusCancelled = dynamic(dark: UIColor.white.withAlphaComponent(0.30), light: UIColor.hex(0x0F172A, 0.40))
    static let statusSuspended = dynamic(dark: UIColor(hex: 0x94A3B8), light: UIColor(hex: 0x64748B))
    static let statusNone = dynamic(dark: UIColor.white.withAlphaComponent(0.18), light: UIColor.hex(0x0F172A, 0.18))

    static let friendshipPending = dynamic(dark: UIColor(hex: 0xFFC93C), light: UIColor(hex: 0xF59E28))
    static let friendshipAccepted = dynamic(dark: UIColor(hex: 0x34D8A0), light: UIColor(hex: 0x12B172))
    static let friendshipBlocked = dynamic(dark: UIColor(hex: 0xFF6384), light: UIColor(hex: 0xF0435F))

    static let roomEvent = dynamic(dark: UIColor(hex: 0xB98BFF), light: UIColor(hex: 0x9E5AEE))
    static let roomAvailabilityEmpty = dynamic(dark: UIColor.hex(0x3DA9F0, 0.16), light: UIColor.hex(0x1E96E6, 0.12))
    static let eventMixTarget = dynamic(dark: UIColor.white, light: UIColor.black)

    // brand ring (ロゴ/キャラ由来・科目色パレット)
    static let brandTeal = Color(UIColor(hex: 0x56D8C3))
    static let brandBlue = Color(UIColor(hex: 0x568CFC))
    static let brandIndigo = Color(UIColor(hex: 0x8F7EFC))
    static let brandViolet = Color(UIColor(hex: 0xA978FA))
    static let brandMagenta = Color(UIColor(hex: 0xFC6ABF))
    static let brandCoral = Color(UIColor(hex: 0xFD728E))

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

extension Color {
    /// 科目色 hex を ratio(0..1) で不透明な base 面に合成する。
    /// Web の color-mix(in srgb, subject ratio%, base) 相当。★ 半透明にしない = 下地の罫線を透かさない。
    /// dynamic(base が light/dark で変わる)を保つため UIColor(dynamicProvider:) で trait ごとに解決して混ぜる。
    static func opaqueTint(hex: String, ratio: CGFloat, base: Color) -> Color {
        let subject = UIColor(Color(hexString: hex))
        let baseColor = UIColor(base)
        return Color(UIColor { traits in
            let s = subject.resolvedColor(with: traits)
            let b = baseColor.resolvedColor(with: traits)
            var sr: CGFloat = 0, sg: CGFloat = 0, sb: CGFloat = 0, sa: CGFloat = 0
            var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
            s.getRed(&sr, green: &sg, blue: &sb, alpha: &sa)
            b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
            let r = ratio
            return UIColor(red: sr * r + br * (1 - r),
                           green: sg * r + bg * (1 - r),
                           blue: sb * r + bb * (1 - r),
                           alpha: 1)      // ★ 常に alpha=1 (不透明)
        })
    }
}
