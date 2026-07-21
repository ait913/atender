import SwiftUI

struct SemesterListSheet: View {
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var semesters: [SemesterDto] = []
    @State private var defaultSemesterId: String?
    @State private var editingId: String?
    @State private var editForm = SemesterForm()
    @State private var newForm = SemesterForm()
    @State private var isPending = false

    struct SemesterForm: Equatable {
        var name = ""
        var startDate = ""
        var endDate = ""
    }

    var body: some View {
        SheetScaffold(title: "学期管理", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                VStack(spacing: Space.s2) {
                    ForEach(semesters) { semester in
                        semesterRow(semester)
                    }
                }
                Rectangle()
                    .fill(Color.borderSubtle)
                    .frame(height: 1)
                    .padding(.top, Space.s3)
                VStack(alignment: .leading, spacing: Space.s4) {
                    LabeledInput(label: "学期名", text: $newForm.name)
                    dateField(label: "開始日", date: $newForm.startDate)
                    dateField(label: "終了日", date: $newForm.endDate)
                    AtenderButton(title: "学期を追加", variant: .primary, isLoading: isPending, isEnabled: SemesterListLogic.createEnabled(newForm) && !isPending) {
                        Task { await createSemester() }
                    }
                }
                .padding(.top, Space.s2)
            }
        } footer: {
            EmptyView()
        }
        .accessibilityIdentifier("semester-list-sheet")
        .task { await reload() }
        .onChange(of: isPresented) { _, open in
            if open { Task { await reload() } }
        }
    }

    @ViewBuilder
    private func semesterRow(_ semester: SemesterDto) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            if editingId == semester.id {
                LabeledInput(label: "学期名", text: $editForm.name)
                dateField(label: "開始日", date: $editForm.startDate)
                dateField(label: "終了日", date: $editForm.endDate)
                HStack {
                    Spacer()
                    AtenderButton(title: "保存", variant: .primary, size: .sm, isLoading: isPending, isEnabled: !SemesterListLogic.saveDisabled(editForm) && !isPending) {
                        Task { await updateSemester(semester) }
                    }
                    .frame(maxWidth: 96)
                    AtenderButton(title: "キャンセル", variant: .ghost, size: .sm) {
                        editingId = nil
                    }
                    .frame(maxWidth: 110)
                }
            } else {
                HStack(spacing: Space.s3) {
                    Button {
                        Task { await selectDefault(semester) }
                    } label: {
                        VStack(alignment: .leading, spacing: Space.s1) {
                            Text(semester.name)
                                .font(.atenderBase)
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.textPrimary)
                            Text(SemesterListLogic.subtitle(semester, defaultSemesterId: defaultSemesterId))
                                .font(.atenderXs)
                                .foregroundStyle(Color.textSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    HStack(spacing: Space.s2) {
                        AtenderButton(title: "編集", variant: .ghost, size: .sm) {
                            startEditing(semester)
                        }
                        .frame(width: 70)
                        AtenderButton(title: "削除", variant: .ghost, size: .sm) {
                            Task { await deleteSemester(id: semester.id) }
                        }
                        .frame(width: 70)
                    }
                }
            }
        }
        .padding(Space.s3)
        .background(Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                .stroke(Color.borderSubtle, lineWidth: 1)
        }
    }

    private func dateField(label: String, date: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(label)
                .font(.atenderXs)
                .fontWeight(.bold)
                .foregroundStyle(Color.textSecondary)
            DatePicker("", selection: Binding(
                get: { CalendarRange.parse(date.wrappedValue) ?? CalendarRange.parse(SchoolClock.todayString()) ?? Date() },
                set: { date.wrappedValue = CalendarRange.yyyyMMdd($0) }
            ), displayedComponents: .date)
            .labelsHidden()
            .datePickerStyle(.compact)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func reload() async {
        semesters = (try? await environment.semesterRepository.semesters(force: true)) ?? []
        defaultSemesterId = (try? await environment.meRepository.me())?.user.defaultSemesterId
    }

    private func startEditing(_ semester: SemesterDto) {
        editingId = semester.id
        editForm = SemesterForm(name: semester.name, startDate: semester.startDate, endDate: semester.endDate)
    }

    private func selectDefault(_ semester: SemesterDto) async {
        var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
        body.defaultSemesterId = semester.id
        do {
            _ = try await environment.meRepository.updateMe(body)
            await onChanged()
            await reload()
        } catch {
        }
    }

    private func updateSemester(_ semester: SemesterDto) async {
        isPending = true
        defer { isPending = false }
        let body = SemesterListLogic.updateBody(form: editForm, current: semester)
        do {
            _ = try await environment.semesterRepository.updateSemester(id: semester.id, body)
            editingId = nil
            await onChanged()
            await reload()
        } catch {
            environment.toastCenter.show("保存できませんでした")
        }
    }

    private func deleteSemester(id: String) async {
        isPending = true
        defer { isPending = false }
        do {
            try await environment.semesterRepository.deleteSemester(id: id)
            await onChanged()
            await reload()
        } catch APIError.http(status: 409) {
            environment.toastCenter.show("時間割があるため削除できません。先に時間割を削除してください")
        } catch {
            environment.toastCenter.show("削除できませんでした")
        }
    }

    private func createSemester() async {
        isPending = true
        defer { isPending = false }
        let input = SemesterCreateInput(name: newForm.name, startDate: newForm.startDate, endDate: newForm.endDate)
        do {
            _ = try await environment.semesterRepository.createSemester(input)
            newForm = SemesterForm()
            await onChanged()
            await reload()
        } catch {
            environment.toastCenter.show("保存できませんでした")
        }
    }
}

enum SemesterListLogic {
    static func subtitle(_ s: SemesterDto, defaultSemesterId: String?) -> String {
        let base = "\(s.startDate) - \(s.endDate)"
        return defaultSemesterId == s.id ? "\(base) / 現在" : base
    }

    static func saveDisabled(_ f: SemesterListSheet.SemesterForm) -> Bool {
        f.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || f.startDate > f.endDate
    }

    static func createEnabled(_ f: SemesterListSheet.SemesterForm) -> Bool {
        !f.name.isEmpty && !f.startDate.isEmpty && !f.endDate.isEmpty
    }

    static func updateBody(form: SemesterListSheet.SemesterForm, current: SemesterDto) -> SemesterUpdateInput {
        var body = SemesterUpdateInput(name: nil, startDate: nil, endDate: nil)
        let trimmedName = form.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty, form.name != current.name {
            body.name = form.name
        }
        if form.startDate != current.startDate {
            body.startDate = form.startDate
        }
        if form.endDate != current.endDate {
            body.endDate = form.endDate
        }
        return body
    }
}
