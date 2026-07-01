import SwiftUI

enum ButtonVariant {
    case primary
    case secondary
    case destructive
    case ghost
    case danger
}

enum ButtonSize {
    case sm
    case md
    case lg
}

struct AtenderButton: View {
    enum Style {
        case primary
        case secondary
    }

    let title: String
    var systemImage: String?
    var variant: ButtonVariant = .primary
    var size: ButtonSize = .md
    var isLoading = false
    var isEnabled = true
    let action: () -> Void

    init(
        title: String,
        systemImage: String? = nil,
        variant: ButtonVariant = .primary,
        size: ButtonSize = .md,
        isLoading: Bool = false,
        isEnabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.variant = variant
        self.size = size
        self.isLoading = isLoading
        self.isEnabled = isEnabled
        self.action = action
    }

    init(
        title: String,
        systemImage: String? = nil,
        style: Style,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) {
        self.init(
            title: title,
            systemImage: systemImage,
            variant: style == .primary ? .primary : .secondary,
            isLoading: isLoading,
            action: action
        )
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: Space.buttonGap) {
                if isLoading {
                    ProgressView()
                        .tint(foreground)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
                    .font(font)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, verticalPadding)
            .padding(.horizontal, horizontalPadding)
            .foregroundStyle(foreground)
            .background(background)
            .overlay {
                if showsBorder {
                    Capsule().stroke(Color.borderDefault, lineWidth: 1)
                }
            }
            .clipShape(Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(ScaleButtonStyle())
        .disabled(isLoading || !isEnabled)
        .opacity(isEnabled ? 1 : 0.52)
        .if(variant == .primary) { view in
            view.atenderShadow(.glowSoft)
        }
    }

    private var font: Font {
        switch size {
        case .sm: return .atenderSm
        case .md: return .atenderBase
        case .lg: return .atenderLg
        }
    }

    private var verticalPadding: CGFloat {
        switch size {
        case .sm: return Space.s2
        case .md: return Space.s3
        case .lg: return Space.s4
        }
    }

    private var horizontalPadding: CGFloat {
        switch size {
        case .sm: return Space.s3
        case .md: return Space.s4
        case .lg: return Space.s5
        }
    }

    private var foreground: Color {
        switch variant {
        case .primary: return .textOnAccent
        case .danger, .destructive: return .textOnDanger
        case .secondary, .ghost: return .textPrimary
        }
    }

    private var background: Color {
        switch variant {
        case .primary: return .accent500
        case .secondary: return .bgElevated
        case .destructive, .danger: return .statusAbsent
        case .ghost: return .clear
        }
    }

    private var showsBorder: Bool {
        variant == .secondary || variant == .ghost
    }
}

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}
