import SwiftUI

extension Font {
    static func atender(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom(interPostScriptName(for: weight), size: size, relativeTo: .body)
    }

    private static func interPostScriptName(for weight: Font.Weight) -> String {
        switch weight {
        case .medium: return "Inter-Medium"
        case .semibold: return "Inter-SemiBold"
        case .bold: return "Inter-Bold"
        case .black, .heavy: return "Inter-Black"
        default: return "Inter-Regular"
        }
    }

    static var atenderXs: Font { atender(11) }
    static var atenderSm: Font { atender(13) }
    static var atenderBase: Font { atender(14) }
    static var atenderLg: Font { atender(17) }
    static var atenderXl: Font { atender(20) }
    static var atender2xl: Font { atender(24) }
    static var atender3xl: Font { atender(30) }
    static var atender4xl: Font { atender(36) }
    static var atender5xl: Font { atender(44) }
}

enum Leading {
    static let tight: CGFloat = 1.1
    static let snug: CGFloat = 1.2
    static let normal: CGFloat = 1.4
    static let body: CGFloat = 1.4
    static let relaxed: CGFloat = 1.5
}
