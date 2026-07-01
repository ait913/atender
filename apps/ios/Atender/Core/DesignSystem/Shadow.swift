import SwiftUI

struct ShadowSpec {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat
}

enum AtenderShadow {
    case card
    case sheet
    case glow
    case glowSoft
    case settingsPanel

    func specs(_ scheme: ColorScheme) -> [ShadowSpec] {
        switch (self, scheme) {
        case (.card, .dark):
            return [
                .init(color: .black.opacity(0.45), radius: 24, x: 0, y: 8),
                .init(color: .black.opacity(0.30), radius: 6, x: 0, y: 2),
            ]
        case (.card, _):
            return [
                .init(color: Color(UIColor(hex: 0x0F172A)).opacity(0.08), radius: 3, x: 0, y: 1),
                .init(color: Color(UIColor(hex: 0x0F172A)).opacity(0.06), radius: 16, x: 0, y: 4),
            ]
        case (.sheet, .dark):
            return [
                .init(color: .black.opacity(0.65), radius: 48, x: 0, y: -16),
                .init(color: .black.opacity(0.40), radius: 8, x: 0, y: -2),
            ]
        case (.sheet, _):
            return [
                .init(color: Color(UIColor(hex: 0x0F172A)).opacity(0.14), radius: 24, x: 0, y: -6),
                .init(color: Color(UIColor(hex: 0x0F172A)).opacity(0.08), radius: 8, x: 0, y: -2),
            ]
        case (.glow, .dark):
            return [
                .init(color: .accent500.opacity(0.45), radius: 24, x: 0, y: 0),
                .init(color: .accent500.opacity(0.20), radius: 48, x: 0, y: 0),
            ]
        case (.glow, _):
            return [.init(color: .accent500.opacity(0.32), radius: 20, x: 0, y: 0)]
        case (.glowSoft, .dark):
            return [.init(color: .accent500.opacity(0.28), radius: 16, x: 0, y: 0)]
        case (.glowSoft, _):
            return [.init(color: .accent500.opacity(0.22), radius: 12, x: 0, y: 0)]
        case (.settingsPanel, .dark):
            return []
        case (.settingsPanel, _):
            return [.init(color: Color(UIColor(hex: 0x0F172A)).opacity(0.04), radius: 2, x: 0, y: 1)]
        }
    }
}

private struct AtenderShadowModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let shadow: AtenderShadow

    func body(content: Content) -> some View {
        shadow.specs(colorScheme).reduce(AnyView(content)) { view, spec in
            AnyView(view.shadow(color: spec.color, radius: spec.radius, x: spec.x, y: spec.y))
        }
    }
}

extension View {
    func atenderShadow(_ shadow: AtenderShadow) -> some View {
        modifier(AtenderShadowModifier(shadow: shadow))
    }
}
