import SwiftUI

struct SettingsRowSpec: Identifiable {
    let id: String
    let label: String
    var danger: Bool = false
    var trailingText: String?
    let action: () -> Void
}

struct SettingsSection: View {
    private enum BodyKind {
        case rows([SettingsRowSpec])
        case custom(AnyView)
    }

    let title: String
    private let bodyKind: BodyKind

    init(title: String, rows: [SettingsRowSpec]) {
        self.title = title
        self.bodyKind = .rows(rows)
    }

    init<C: View>(title: String, @ViewBuilder content: () -> C) {
        self.title = title
        self.bodyKind = .custom(AnyView(content()))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.atender(11, .semibold))
                .foregroundStyle(Color.textTertiary)
                .textCase(.uppercase)
                .tracking(0.5)
                .padding(.horizontal, Space.s1)
                .padding(.bottom, 6)
            content
                .background(Color.bgElevated)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .stroke(Color.borderSettings, lineWidth: 1)
                }
                .atenderShadow(.settingsPanel)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch bodyKind {
        case .rows(let rows):
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, spec in
                    if index > 0 {
                        Rectangle().fill(Color.borderSubtle).frame(height: 1)
                    }
                    SettingsRow(spec: spec)
                }
            }
        case .custom(let view):
            view
        }
    }
}

private struct SettingsRow: View {
    let spec: SettingsRowSpec

    var body: some View {
        Button(action: spec.action) {
            HStack {
                Text(spec.label)
                    .font(.atenderSm)
                    .fontWeight(.bold)
                    .foregroundStyle(spec.danger ? Color.statusAbsent : Color.textPrimary)
                Spacer()
                if let trailingText = spec.trailingText {
                    Text(trailingText)
                        .font(.atenderSm)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textTertiary)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textTertiary)
                }
            }
            .padding(.horizontal, Space.s4)
            .padding(.vertical, Space.s3)
            .contentShape(Rectangle())
        }
        .buttonStyle(SettingsRowButtonStyle())
        .accessibilityIdentifier(spec.id)
    }
}

private struct SettingsRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
