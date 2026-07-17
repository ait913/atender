import SwiftUI

struct RequiredRateSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var value = 70
    @State private var isPending = false
    static let presets = [60, 66, 70, 80]

    var body: some View {
        SheetScaffold(title: "必要出席率", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("必要出席率")
                        .font(.atenderSm)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textSecondary)
                    HStack(spacing: Space.s3) {
                        NumberStepper(value: $value, min: 1, max: 100, label: "必要出席率")
                        Text("%")
                            .font(.atenderLg)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.textPrimary)
                    }
                }
                HStack(spacing: Space.s2) {
                    ForEach(Self.presets, id: \.self) { preset in
                        Button {
                            value = preset
                        } label: {
                            Text("\(preset)")
                                .font(.atenderSm)
                                .fontWeight(.bold)
                                .foregroundStyle(value == preset ? Color.textOnAccent : Color.textSecondary)
                                .padding(.horizontal, Space.s4)
                                .padding(.vertical, Space.s2)
                                .background(value == preset ? Color.accent500 : Color.bgMuted)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                Text("全科目共通。出席率の色分けと「あと何限休めるか」の基準になります")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textTertiary)
                    .lineSpacing(Leading.relaxed)
            }
        } footer: {
            AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: !isPending) {
                Task { await save() }
            }
        }
        .accessibilityIdentifier("required-rate-sheet")
        .task { await load() }
        .onChange(of: isPresented) { _, open in
            if open { Task { await load() } }
        }
    }

    private func load() async {
        value = (try? await environment.meRepository.me())?.user.requiredAttendanceRate ?? 70
    }

    private func save() async {
        isPending = true
        defer { isPending = false }
        var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
        body.requiredAttendanceRate = value
        do {
            _ = try await environment.meRepository.updateMe(body)
            await onSaved()
            isPresented = false
        } catch {
        }
    }
}

struct ErrorBanner: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.atenderSm)
            .fontWeight(.bold)
            .foregroundStyle(Color.statusAbsent)
            .padding(.horizontal, Space.s4)
            .padding(.vertical, Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.statusAbsent.opacity(0.15))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
}
