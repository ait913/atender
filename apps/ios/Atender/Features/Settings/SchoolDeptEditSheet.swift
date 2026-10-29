import SwiftUI

struct SchoolDeptEditSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var user: UserDto?
    @State private var picker: SchoolDepartmentPickerModel?
    @State private var templateScope: TemplateScope?
    @State private var showsTemplates = false
    @State private var isPending = false

    var body: some View {
        SheetScaffold(title: "学校・学科", isPresented: guardedPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                Text("現在: \(currentSchoolDepartment)")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textSecondary)
                if let picker {
                    SchoolDepartmentPickerView(model: picker)
                        .disabled(isPending)
                }
            }
            .navigationDestination(isPresented: $showsTemplates) {
                if let templateScope {
                    TemplateBrowser(
                        purpose: .importInto(initialSemesterId: user?.defaultSemesterId, lockSemester: false),
                        showsFoundBanner: true,
                        initialScope: templateScope,
                        onImported: { _ in isPresented = false },
                        onSelected: { _ in },
                        onClose: { isPresented = false }
                    )
                }
            }
        } footer: {
            HStack {
                Spacer()
                AtenderButton(title: "キャンセル", variant: .ghost, isEnabled: !isPending) { isPresented = false }
                    .frame(maxWidth: 120)
                AtenderButton(title: "保存", variant: picker?.stage == .department ? .primary : .secondary, isLoading: isPending, isEnabled: canSave) {
                    Task { await save() }
                }
                .frame(maxWidth: 120)
            }
        }
        .accessibilityIdentifier("school-dept-sheet")
        .interactiveDismissDisabled(isPending)
        .task { await load() }
    }

    private var guardedPresented: Binding<Bool> {
        Binding(get: { isPresented }, set: { if !isPending { isPresented = $0 } })
    }

    private var currentSchoolDepartment: String {
        guard let schoolName = user?.schoolName, !schoolName.isEmpty,
              let departmentName = user?.departmentName, !departmentName.isEmpty else { return "未設定" }
        return "\(schoolName) / \(departmentName)"
    }

    private var canSave: Bool {
        guard let user, let school = picker?.school, let department = picker?.department else { return false }
        return !isPending && (school.id != user.schoolId || department.id != user.departmentId)
    }

    private func load() async {
        // 親の再読み込みや push からの復帰で、選択と遷移の状態を初期化しない。
        if picker == nil {
            picker = SchoolDepartmentPickerModel(schoolRepository: environment.schoolRepository, allowsCreate: true)
        }
        guard user == nil else { return }
        user = try? await environment.meRepository.me().user
    }

    private func save() async {
        guard canSave, let school = picker?.school, let department = picker?.department else { return }
        isPending = true
        defer { isPending = false }
        do {
            user = try await environment.meRepository.updateMe(MeUpdateInput(schoolId: school.id, departmentId: department.id)).user
        } catch {
            environment.toastCenter.show("保存できませんでした")
            return
        }
        await onSaved()
        let suggestions = (try? await environment.templateRepository.templates(
            TemplateSearchQuery(schoolId: school.id, departmentId: department.id, q: nil, limit: 20, cursor: nil),
            force: true
        )) ?? []
        if !TemplateSuggestionLogic.visible(suggestions).isEmpty {
            templateScope = TemplateScope(schoolId: school.id, departmentId: department.id,
                                          schoolName: school.name, departmentName: department.name)
            showsTemplates = true
        } else {
            environment.toastCenter.show("学校・学科を変更しました")
            isPresented = false
        }
    }
}
