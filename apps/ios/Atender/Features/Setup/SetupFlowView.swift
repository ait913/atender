import SwiftUI
import Observation

struct SetupFlowView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var model: SetupViewModel?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("セットアップ")
                        .font(.atender3xl)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textPrimary)
                    Text(model?.title ?? "Step 1/3: 学校を選ぶ")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                }
                Panel {
                    if let model {
                        setupContent(model)
                    } else {
                        ProgressView().tint(.accent500)
                    }
                }
            }
            .padding(Space.pagePxMobile)
            .padding(.vertical, Space.s6)
        }
        .background(Color.bgBase)
        .accessibilityIdentifier("setup-flow")
        .task {
            if model == nil {
                model = SetupViewModel(env: environment)
            }
        }
    }

    @ViewBuilder
    private func setupContent(_ model: SetupViewModel) -> some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: Space.s4) {
            if let errorText = model.errorText {
                ErrorBanner(text: errorText)
            }
            switch model.step {
            case 1:
                stepOne(model)
            case 2:
                stepTwo(model)
            default:
                stepThree(model)
            }
        }
    }

    private func stepOne(_ model: SetupViewModel) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: Space.s4) {
            LabeledInput(label: "", text: $model.schoolQuery, placeholder: "学校名で検索")
            Picker("都道府県", selection: $model.prefecture) {
                ForEach(SetupViewModel.prefectures, id: \.self) { item in
                    Text(item.isEmpty ? "都道府県" : item).tag(item)
                }
            }
            .pickerStyle(.menu)
            .task(id: "\(model.schoolQuery)|\(model.prefecture)") {
                try? await Task.sleep(nanoseconds: 300_000_000)
                await model.searchSchools()
            }
            VStack(spacing: Space.s2) {
                ForEach(model.schools) { school in
                    resultButton(title: "○ \(school.name)", selected: false) {
                        model.school = school
                        model.step = 2
                        Task { await model.loadDepartments() }
                    }
                }
            }
            AtenderButton(title: "＋ リストに無い学校を追加", isLoading: model.busy, isEnabled: !model.schoolQuery.isEmpty && !model.busy) {
                Task { await model.addSchool() }
            }
        }
    }

    private func stepTwo(_ model: SetupViewModel) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: Space.s4) {
            LabeledInput(label: "", text: $model.departmentQuery, placeholder: "\(model.school?.name ?? "") の学科名で検索")
                .task(id: "\(model.school?.id ?? "")|\(model.departmentQuery)") {
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    await model.loadDepartments()
                }
            VStack(spacing: Space.s2) {
                ForEach(model.departments) { department in
                    resultButton(title: "○ \(department.name)", selected: model.department?.id == department.id) {
                        model.department = department
                    }
                }
            }
            HStack(spacing: Space.s3) {
                AtenderButton(title: "戻る", variant: .ghost) { model.step = 1 }
                AtenderButton(title: "＋ 学科を追加", isLoading: model.busy, isEnabled: !model.departmentQuery.isEmpty && !model.busy) {
                    Task { await model.addDepartment() }
                }
                AtenderButton(title: "次へ", variant: .primary, isLoading: model.busy, isEnabled: model.department != nil && !model.busy) {
                    Task { await model.submitDepartment() }
                }
            }
        }
    }

    private func stepThree(_ model: SetupViewModel) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: Space.s4) {
            LabeledInput(label: "名前", text: $model.semester.name)
            setupDateField(label: "開始日", date: $model.semester.startDate)
            setupDateField(label: "終了日", date: $model.semester.endDate)
            HStack(spacing: Space.s3) {
                AtenderButton(title: "戻る", variant: .ghost) { model.step = 2 }
                AtenderButton(title: "完了して時間割を作る", variant: .primary, isLoading: model.busy, isEnabled: !model.busy) {
                    Task { await model.submitSemester() }
                }
            }
        }
    }

    private func resultButton(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atenderBase)
                .foregroundStyle(Color.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Space.s3)
                .background(selected ? Color.accent50 : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .stroke(selected ? Color.accent500 : Color.borderSubtle, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }

    private func setupDateField(label: String, date: Binding<String>) -> some View {
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
        }
    }
}

@MainActor
@Observable
final class SetupViewModel {
    @ObservationIgnored private let env: AppEnvironment

    init(env: AppEnvironment) {
        self.env = env
    }

    var step: Int = 1
    var schoolQuery = ""
    var prefecture = ""
    var departmentQuery = ""
    private(set) var schools: [SchoolDto] = []
    private(set) var departments: [DepartmentDto] = []
    var school: SchoolDto?
    var department: DepartmentDto?
    var semester = SemesterDraft(name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30")
    private(set) var busy = false
    var errorText: String?

    struct SemesterDraft: Equatable {
        var name: String
        var startDate: String
        var endDate: String
    }

    static let prefectures = ["", "北海道", "東京都", "千葉県", "神奈川県", "埼玉県", "大阪府", "京都府", "愛知県", "福岡県"]

    var title: String {
        "Step \(step)/3: " + (step == 1 ? "学校を選ぶ" : step == 2 ? "学科を選ぶ" : "学期を作る")
    }

    func searchSchools() async {
        errorText = nil
        do {
            schools = try await env.schoolRepository.schools(SchoolSearchQuery(q: schoolQuery.isEmpty ? nil : schoolQuery, prefecture: prefecture.isEmpty ? nil : prefecture, kind: nil, limit: 20))
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func loadDepartments() async {
        guard let school else { return }
        errorText = nil
        do {
            departments = try await env.schoolRepository.departments(schoolId: school.id, q: departmentQuery.isEmpty ? nil : departmentQuery)
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func addSchool() async {
        guard !schoolQuery.isEmpty else { return }
        busy = true
        errorText = nil
        defer { busy = false }
        do {
            school = try await env.schoolRepository.createSchool(SchoolCreateInput(name: schoolQuery, nameKana: nil, kind: .other, prefecture: prefecture.isEmpty ? nil : prefecture))
            step = 2
            await loadDepartments()
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func addDepartment() async {
        guard !departmentQuery.isEmpty, let school else { return }
        busy = true
        errorText = nil
        defer { busy = false }
        do {
            department = try await env.schoolRepository.createDepartment(schoolId: school.id, DepartmentCreateInput(name: departmentQuery, nameKana: nil))
            await loadDepartments()
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func submitDepartment() async {
        guard let school, let department else { return }
        busy = true
        errorText = nil
        defer { busy = false }
        do {
            var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
            body.schoolId = school.id
            body.departmentId = department.id
            _ = try await env.meRepository.updateMe(body)
            step = 3
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func submitSemester() async {
        guard school != nil, department != nil else { return }
        busy = true
        errorText = nil
        defer { busy = false }
        do {
            let created = try await env.semesterRepository.createSemester(SemesterCreateInput(name: semester.name, startDate: semester.startDate, endDate: semester.endDate))
            var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
            body.defaultSemesterId = created.id
            _ = try await env.meRepository.updateMe(body)
            await env.authStore.refreshMe()
        } catch {
            errorText = error.userFacingMessage
        }
    }
}
