import SwiftUI

struct AuthProviderButton: View {
    enum Fill {
        case accent
        case outline
    }

    let title: String
    var leadingSystemImage: String?
    var leadingAssetName: String?
    var fill: Fill
    var isLoading = false
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if isLoading {
                    ProgressView()
                        .tint(foreground)
                } else {
                    HStack(spacing: Space.s2) {
                        if let leadingSystemImage {
                            Image(systemName: leadingSystemImage)
                                .font(.system(size: 18, weight: .semibold))
                                .frame(width: 18, height: 18)
                        } else if let leadingAssetName {
                            Image(leadingAssetName)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 18, height: 18)
                        }
                        Text(title)
                            .font(.atenderLg.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)
                    }
                    .foregroundStyle(foreground)
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: Space.s12)
            .background { backgroundFill }
            .overlay {
                if fill == .outline {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .stroke(Color.borderDefault, lineWidth: 1)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        }
        .buttonStyle(AuthProviderScaleButtonStyle())
        .disabled(isLoading || !isEnabled)
        .opacity(isEnabled ? 1 : 0.52)
    }

    private var foreground: Color {
        switch fill {
        case .accent: return .textOnAccent
        case .outline: return .textPrimary
        }
    }

    @ViewBuilder
    private var backgroundFill: some View {
        switch fill {
        case .accent: Color.accentGradient
        case .outline: Color.bgElevated
        }
    }
}

private struct AuthProviderScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
