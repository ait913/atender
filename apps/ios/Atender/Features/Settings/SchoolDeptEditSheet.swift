import SwiftUI

struct SchoolDeptEditSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var schoolId = ""
    @State private var departmentId = ""
    @State private var isPending = false

    var body: some View {
        SheetScaffold(title: "学校・学科", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "学校 ID", text: $schoolId)
                LabeledInput(label: "学科 ID", text: $departmentId)
            }
        } footer: {
            HStack {
                Spacer()
                AtenderButton(title: "キャンセル", variant: .ghost) { isPresented = false }
                    .frame(maxWidth: 120)
                AtenderButton(title: "保存", variant: .primary, isLoading: isPending, isEnabled: !schoolId.isEmpty && !departmentId.isEmpty && !isPending) {
                    Task { await save() }
                }
                .frame(maxWidth: 120)
            }
        }
        .accessibilityIdentifier("school-dept-sheet")
        .task { await load() }
    }

    private func load() async {
        guard let user = (try? await environment.meRepository.me())?.user else { return }
        schoolId = user.schoolId ?? ""
        departmentId = user.departmentId ?? ""
    }

    private func save() async {
        isPending = true
        defer { isPending = false }
        var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
        body.schoolId = schoolId
        body.departmentId = departmentId
        do {
            _ = try await environment.meRepository.updateMe(body)
            await onSaved()
            isPresented = false
        } catch {
        }
    }
}
