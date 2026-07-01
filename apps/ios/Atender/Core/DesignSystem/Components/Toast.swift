import SwiftUI
import Observation

@MainActor
@Observable
final class ToastCenter {
    private(set) var message: String?
    @ObservationIgnored private var dismissTask: Task<Void, Never>?

    func show(_ message: String, duration: TimeInterval = 2.6) {
        dismissTask?.cancel()
        self.message = message
        dismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(duration))
            await MainActor.run {
                self?.message = nil
            }
        }
    }
}

struct ToastOverlay: View {
    @Environment(ToastCenter.self) private var center

    var body: some View {
        VStack {
            Spacer()
            if let message = center.message {
                Text(message)
                    .font(.atenderSm)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textPrimary)
                    .padding(.vertical, Space.s3)
                    .padding(.horizontal, Space.s4)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color.borderDefault, lineWidth: 1))
                    .padding(.bottom, Space.tabBarHeight + Space.s4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.18), value: center.message)
    }
}
