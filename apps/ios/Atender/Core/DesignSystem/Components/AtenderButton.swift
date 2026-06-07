import SwiftUI

struct AtenderButton: View {
    enum Style {
        case primary
        case secondary
    }

    let title: String
    var systemImage: String?
    var style: Style = .primary
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Space.s2) {
                if isLoading {
                    ProgressView()
                        .tint(foreground)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
                    .font(.atenderBase.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Space.s3)
            .padding(.horizontal, Space.s4)
            .foregroundStyle(foreground)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        }
        .disabled(isLoading)
    }

    private var foreground: Color {
        style == .primary ? .white : .textPrimary
    }

    private var background: Color {
        style == .primary ? .accent : .bgElevated
    }
}

#Preview("AtenderButton Dark") {
    VStack {
        AtenderButton(title: "全部出席", systemImage: "checkmark.circle") {}
        AtenderButton(title: "再読み込み", systemImage: "arrow.clockwise", style: .secondary) {}
    }
    .padding()
    .background(Color.bgBase)
    .preferredColorScheme(.dark)
}

#Preview("AtenderButton Light") {
    VStack {
        AtenderButton(title: "全部出席", systemImage: "checkmark.circle") {}
        AtenderButton(title: "再読み込み", systemImage: "arrow.clockwise", style: .secondary) {}
    }
    .padding()
    .background(Color.bgBase)
    .preferredColorScheme(.light)
}
