import SwiftUI

enum ThemePreference: String, CaseIterable, Codable {
    case auto
    case light
    case dark

    var colorScheme: ColorScheme? {
        switch self {
        case .auto: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    var label: String {
        switch self {
        case .auto: return "自動"
        case .light: return "ライト"
        case .dark: return "ダーク"
        }
    }
}

enum Theme {
    static let background = Color.bgBase
    static let surface = Color.bgElevated
    static let mutedSurface = Color.bgMuted
    static let foreground = Color.textPrimary
    static let secondary = Color.textSecondary
    static let tertiary = Color.textTertiary
    static let accent = Color.accent
}
