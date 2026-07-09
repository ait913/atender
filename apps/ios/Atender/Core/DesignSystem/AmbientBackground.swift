import SwiftUI

struct AmbientBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            Color.bgBase
            if colorScheme != .dark {
                RadialGradient(
                    colors: [.accent500.opacity(0.08), .accent500.opacity(0.0)],
                    center: .top,
                    startRadius: 0,
                    endRadius: 420
                )
                .blur(radius: 60)
                .offset(y: -60)
            }
            if colorScheme == .dark {
                RadialGradient(
                    colors: [.accent500.opacity(0.20), .accent500.opacity(0.0)],
                    center: .topLeading,
                    startRadius: 0,
                    endRadius: 360
                )
                .blur(radius: 44)
                .offset(x: -120, y: -120)

                RadialGradient(
                    colors: [.roomEvent.opacity(0.16), .roomEvent.opacity(0.0)],
                    center: .bottomTrailing,
                    startRadius: 0,
                    endRadius: 360
                )
                .blur(radius: 52)
                .offset(x: 120, y: 160)
            }
        }
        .ignoresSafeArea()
    }
}
