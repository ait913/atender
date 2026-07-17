import SwiftUI
import UIKit

struct AuthProviderButton: View {
    enum Kind: Equatable {
        case apple
        case google
        case email
    }

    let kind: Kind
    let title: String
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if isLoading {
                    ProgressView()
                        .tint(foreground)
                } else {
                    HStack(spacing: iconSpacing) {
                        icon
                            .frame(width: iconFrameWidth, height: 44, alignment: .leading)

                        Text(title)
                            .font(titleFont)
                            .foregroundStyle(foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)

                        Spacer(minLength: Space.s4)
                    }
                    .padding(.leading, leadingPadding)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background { backgroundFill }
            .overlay {
                if hasBorder {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .strokeBorder(Color(uiColor: UIColor(hex: 0x747775)), lineWidth: 1)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        }
        .buttonStyle(AuthProviderScaleButtonStyle())
        .disabled(isLoading || !isEnabled)
        .opacity(isEnabled ? 1 : 0.52)
    }

    @ViewBuilder
    private var icon: some View {
        switch kind {
        case .apple:
            Image("apple-logo")
                .resizable()
                .scaledToFit()
                .frame(width: 31, height: 44)
        case .google:
            Image("google-g")
                .resizable()
                .scaledToFit()
                .frame(width: 20, height: 20)
        case .email:
            Image(systemName: "envelope.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 20, height: 20)
                .foregroundStyle(foreground)
        }
    }

    private var leadingPadding: CGFloat {
        switch kind {
        case .apple: return 8.25
        case .google, .email: return 16
        }
    }

    private var iconFrameWidth: CGFloat {
        switch kind {
        case .apple: return 31
        case .google, .email: return 20
        }
    }

    private var iconSpacing: CGFloat {
        switch kind {
        case .apple: return 8.75
        case .google, .email: return 12
        }
    }

    private var titleFont: Font {
        switch kind {
        case .apple: return .headline
        case .google: return .custom("GoogleSans-Medium", size: 17, relativeTo: .body)
        case .email: return .headline
        }
    }

    private var foreground: Color {
        switch kind {
        case .apple: return Color(uiColor: UIColor(hex: 0x000000))
        case .google: return Color(uiColor: UIColor(hex: 0x1F1F1F))
        case .email: return .textOnAccent
        }
    }

    private var hasBorder: Bool {
        kind == .apple || kind == .google
    }

    @ViewBuilder
    private var backgroundFill: some View {
        switch kind {
        case .apple, .google:
            // Apple/Google auth button colors are brand-fixed values. Do not use theme tokens here:
            // dynamic backgrounds can put the official logos on non-compliant dark surfaces.
            Color(uiColor: UIColor(hex: 0xFFFFFF))
        case .email:
            Color.accentGradient
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
