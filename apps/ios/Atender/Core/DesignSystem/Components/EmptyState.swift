import SwiftUI

struct EmptyState: View {
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: Space.s4) {
            Image("mascot-hello")
                .resizable()
                .scaledToFit()
                .frame(width: 112, height: 112)

            VStack(spacing: Space.s2) {
                Text(title)
                    .font(.atenderLg)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                if let message {
                    Text(message)
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                        .multilineTextAlignment(.center)
                }
            }

            if let actionTitle, let action {
                AtenderButton(title: actionTitle, size: .sm, action: action)
                    .fixedSize(horizontal: true, vertical: false)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 256)
        .padding(Space.s5)
        .background(Color.textPrimary.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
}
