import SwiftUI

struct Skeleton: View {
    var width: CGFloat?
    var height: CGFloat = 16
    var radius: CGFloat = Radius.sm
    @State private var phase: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color.textPrimary.opacity(0.08))
            .frame(width: width, height: height)
            .overlay {
                LinearGradient(
                    colors: [.clear, .white.opacity(0.16), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .offset(x: phase * 180)
            }
            .clipped()
            .onAppear {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
    }
}
