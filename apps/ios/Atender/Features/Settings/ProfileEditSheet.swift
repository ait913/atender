import SwiftUI

struct ProfileEditSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var name = ""
    @State private var handle = ""
    @State private var errorText: String?
    @State private var isPending = false
    @State private var initialName = ""
    @State private var initialHandle = ""

    var body: some View {
        SheetScaffold(title: "プロフィール", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "名前", text: $name)
                VStack(alignment: .leading, spacing: Space.s2) {
                    LabeledInput(label: "ハンドル", text: $handle, placeholder: "your_handle")
                    Text("半角英数字 + _ のみ (空のままで設定なし)")
                        .font(.atenderXs)
                        .foregroundStyle(Color.textTertiary)
                }
                .onChange(of: handle) { _, value in
                    if value.hasPrefix("@") {
                        handle = String(value.dropFirst())
                    }
                }
                if let errorText {
                    ErrorBanner(text: errorText)
                }
            }
        } footer: {
            HStack {
                Spacer()
                AtenderButton(title: "キャンセル", variant: .ghost) { isPresented = false }
                    .frame(maxWidth: 120)
                AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: !isPending) {
                    Task { await save() }
                }
                .frame(maxWidth: 120)
            }
        }
        .accessibilityIdentifier("profile-edit-sheet")
        .task { await load() }
    }

    private func load() async {
        guard let user = (try? await environment.meRepository.me())?.user else { return }
        name = user.name ?? ""
        handle = user.handle ?? ""
        initialName = name
        initialHandle = handle
    }

    private func save() async {
        errorText = nil
        switch ProfileEditLogic.plan(name: name, handle: handle, currentName: initialName, currentHandle: initialHandle) {
        case .invalidHandle:
            errorText = ProfileEditLogic.invalidHandleMessage
        case .noChange:
            isPresented = false
        case .patch(let body):
            isPending = true
            defer { isPending = false }
            do {
                _ = try await environment.meRepository.updateMe(body)
                await onSaved()
                isPresented = false
            } catch {
                errorText = error.userFacingMessage
            }
        }
    }
}

enum ProfileEditLogic {
    enum Outcome: Equatable { case invalidHandle, noChange, patch(MeUpdateInput) }
    static let invalidHandleMessage = "ハンドルは半角英数字とアンダースコア (_) のみ、30 文字以内です"

    static func plan(name: String, handle: String, currentName: String?, currentHandle: String?) -> Outcome {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedHandle = handle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedHandle.isEmpty, trimmedHandle.range(of: #"^[a-zA-Z0-9_]{1,30}$"#, options: .regularExpression) == nil {
            return .invalidHandle
        }
        var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
        if !trimmedName.isEmpty, trimmedName != currentName {
            body.name = trimmedName
        }
        if !trimmedHandle.isEmpty, trimmedHandle != currentHandle {
            body.handle = trimmedHandle
        }
        if body.name == nil, body.handle == nil {
            return .noChange
        }
        return .patch(body)
    }
}
