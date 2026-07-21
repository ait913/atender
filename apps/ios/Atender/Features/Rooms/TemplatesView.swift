import SwiftUI
import Observation

struct TemplatesView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var model: TemplatesViewModel?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.sectionGapMobile) {
                if let model {
                    content(model)
                } else {
                    ProgressView().tint(.accent500)
                }
            }
            .padding(Space.pagePxMobile)
        }
        .background(Color.bgBase)
        .navigationTitle("みんなの時間割")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let model {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("公開") {
                        Task { await model.publish() }
                    }
                    .disabled(!model.canPublish || model.isPublishing)
                }
            }
        }
        .task {
            if model == nil {
                let model = TemplatesViewModel(env: environment)
                self.model = model
                await model.bootstrap()
            }
        }
    }

    @ViewBuilder
    private func content(_ model: TemplatesViewModel) -> some View {
        @Bindable var model = model

        VStack(alignment: .leading, spacing: Space.sectionGapMobile) {
            if let errorText = model.errorText {
                ErrorBanner(text: errorText)
            }

            switch model.step {
            case .school:
                schoolStep(model)
            case .department:
                departmentStep(model)
            case .list:
                listStep(model)
            }
        }
    }

    private func schoolStep(_ model: TemplatesViewModel) -> some View {
        @Bindable var model = model

        return VStack(alignment: .leading, spacing: Space.s4) {
            LabeledInput(label: "", text: $model.schoolQuery, placeholder: "学校名で検索")
                .task(id: model.schoolQuery) {
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    await model.searchSchools()
                }

            if model.isSearchingSchools {
                ProgressView().tint(.accent500)
            } else if model.schools.isEmpty {
                if model.schoolQuery.isEmpty {
                    ContentUnavailableView("学校を検索", systemImage: "magnifyingglass", description: Text("学校名を入力してください"))
                } else {
                    ContentUnavailableView.search(text: model.schoolQuery)
                }
            } else {
                VStack(spacing: Space.s2) {
                    ForEach(model.schools) { school in
                        resultButton(title: "○ \(school.name)", selected: false) {
                            model.selectSchool(school)
                            Task { await model.loadDepartments() }
                        }
                    }
                }
            }
        }
    }

    private func departmentStep(_ model: TemplatesViewModel) -> some View {
        @Bindable var model = model

        return VStack(alignment: .leading, spacing: Space.s4) {
            breadcrumb(model)

            LabeledInput(label: "", text: $model.departmentQuery, placeholder: "学科名で検索")
                .task(id: "\(model.selectedSchool?.id ?? "")|\(model.departmentQuery)") {
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    await model.loadDepartments()
                }

            if model.isSearchingDepartments {
                ProgressView().tint(.accent500)
            } else if model.departments.isEmpty {
                mascotEmptyState(title: "この学校の学科はまだありません")
            } else {
                VStack(spacing: Space.s2) {
                    ForEach(model.departments) { department in
                        resultButton(title: "○ \(department.name)", selected: model.selectedDepartment?.id == department.id) {
                            model.selectDepartment(department)
                            Task { await model.searchTemplates() }
                        }
                    }
                }
            }
        }
    }

    private func listStep(_ model: TemplatesViewModel) -> some View {
        @Bindable var model = model

        return VStack(alignment: .leading, spacing: Space.s4) {
            breadcrumb(model)

            Picker("取り込み先", selection: $model.semesterId) {
                Text("既定").tag("")
                ForEach(model.semesters) { semester in
                    Text(semester.name).tag(semester.id)
                }
            }
            .pickerStyle(.menu)
            .font(.footnote)
            .onChange(of: model.semesterId) { _, _ in
                Task { await model.resolveCurrentTimetable() }
            }

            LabeledInput(label: "", text: $model.titleQuery, placeholder: "時間割名で絞り込み")
                .task(id: "\(model.selectedDepartment?.id ?? "")|\(model.titleQuery)") {
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    await model.searchTemplates()
                }

            if model.isSearchingTemplates {
                ProgressView().tint(.accent500)
            } else if model.templates.isEmpty {
                mascotEmptyState(title: "この学科の公開時間割はまだありません")
            } else {
                VStack(spacing: Space.s3) {
                    ForEach(model.templates) { template in
                        templateCard(template, model: model)
                    }
                }
                .accessibilityIdentifier("templates-list")
            }
        }
    }

    private func breadcrumb(_ model: TemplatesViewModel) -> some View {
        HStack(spacing: Space.s2) {
            Text(model.selectedSchool?.name ?? "")
                .font(.atenderLg)
                .fontWeight(.semibold)
                .foregroundStyle(Color.textPrimary)
                .lineLimit(1)

            if model.step == .list {
                Text("›")
                    .font(.atenderLg)
                    .foregroundStyle(Color.textTertiary)
                Text(model.selectedDepartment?.name ?? "")
                    .font(.atenderLg)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
            }

            Spacer(minLength: Space.s2)

            AtenderButton(title: "変更", variant: .ghost, size: .sm) {
                model.backToSchool()
            }
            .fixedSize(horizontal: true, vertical: false)
        }
    }

    private func templateCard(_ template: TemplateDto, model: TemplatesViewModel) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: Space.s2) {
                Text(template.title)
                    .font(.atenderLg)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                Text("\(template.schoolName) · \(template.departmentName)")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textSecondary)

                Text("by @\(TemplateLogic.authorHandle(template)) · copy ×\(template.copyCount) · 更新 \(String(template.updatedAt.prefix(10)))")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)

                AtenderButton(
                    title: "追加",
                    variant: .primary,
                    isLoading: model.copyingTemplateId == template.id,
                    isEnabled: model.canCopy && model.copyingTemplateId == nil
                ) {
                    Task { await model.copy(template) }
                }
            }
        }
        .accessibilityIdentifier("template-card-\(template.id)")
    }

    private func resultButton(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.atenderBase)
                .foregroundStyle(Color.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.horizontal, Space.s3)
                .background(selected ? Color.accent50 : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .stroke(selected ? Color.accent500 : Color.borderSubtle, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }

    private func mascotEmptyState(title: String) -> some View {
        ContentUnavailableView {
            VStack(spacing: Space.s3) {
                Image("mascot-hello")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 96, height: 96)
                Text(title)
                    .font(.atenderLg)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.textPrimary)
            }
        }
    }
}

@MainActor
@Observable
final class TemplatesViewModel {
    enum Step {
        case school
        case department
        case list
    }

    @ObservationIgnored private let env: AppEnvironment

    init(env: AppEnvironment) {
        self.env = env
    }

    private(set) var step: Step = .school
    var schoolQuery: String = ""
    var departmentQuery: String = ""
    var titleQuery: String = ""
    private(set) var schools: [SchoolDto] = []
    private(set) var departments: [DepartmentDto] = []
    private(set) var templates: [TemplateDto] = []
    private(set) var selectedSchool: SchoolDto?
    private(set) var selectedDepartment: DepartmentDto?

    private(set) var semesters: [SemesterDto] = []
    var semesterId: String = ""
    private(set) var defaultSemesterId: String?

    private(set) var isSearchingSchools = false
    private(set) var isSearchingDepartments = false
    private(set) var isSearchingTemplates = false
    private(set) var copyingTemplateId: String?
    private(set) var isPublishing = false
    var errorText: String?

    private(set) var currentTimetableId: String?
    private var currentTitle = ""

    var canCopy: Bool {
        effectiveSemesterId != nil
    }

    var canPublish: Bool {
        currentTimetableId != nil
    }

    func bootstrap() async {
        async let me = env.meRepository.me()
        async let sems = env.semesterRepository.semesters()

        if let meResponse = try? await me {
            defaultSemesterId = meResponse.user.defaultSemesterId
        }
        semesters = (try? await sems) ?? []
        await resolveCurrentTimetable()
        await searchSchools()
    }

    func selectSchool(_ school: SchoolDto) {
        selectedSchool = school
        selectedDepartment = nil
        departments = []
        templates = []
        departmentQuery = ""
        titleQuery = ""
        step = .department
    }

    func selectDepartment(_ dep: DepartmentDto) {
        selectedDepartment = dep
        titleQuery = ""
        step = .list
    }

    func backToSchool() {
        step = .school
        selectedSchool = nil
        selectedDepartment = nil
        departments = []
        templates = []
    }

    func backToDepartment() {
        step = .department
        selectedDepartment = nil
        templates = []
    }

    func searchSchools() async {
        errorText = nil
        isSearchingSchools = true
        defer { isSearchingSchools = false }

        do {
            schools = try await env.schoolRepository.schools(
                SchoolSearchQuery(q: schoolQuery.isEmpty ? nil : schoolQuery, prefecture: nil, kind: nil, limit: 20),
                force: true
            )
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func loadDepartments() async {
        guard let selectedSchool else { return }
        errorText = nil
        isSearchingDepartments = true
        defer { isSearchingDepartments = false }

        do {
            departments = try await env.schoolRepository.departments(
                schoolId: selectedSchool.id,
                q: departmentQuery.isEmpty ? nil : departmentQuery,
                force: true
            )
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func searchTemplates() async {
        guard let selectedSchool, let selectedDepartment else { return }
        errorText = nil
        isSearchingTemplates = true
        defer { isSearchingTemplates = false }

        do {
            templates = try await env.templateRepository.templates(
                TemplateSearchQuery(
                    schoolId: selectedSchool.id,
                    departmentId: selectedDepartment.id,
                    q: titleQuery.isEmpty ? nil : titleQuery,
                    limit: 20,
                    cursor: nil
                ),
                force: true
            )
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func copy(_ template: TemplateDto) async {
        guard let target = effectiveSemesterId else { return }
        copyingTemplateId = template.id
        defer { copyingTemplateId = nil }

        do {
            _ = try await env.templateRepository.copyTemplate(id: template.id, TemplateCopyInput(semesterId: target, title: nil))
            env.toastCenter.show("コピーしました")
        } catch APIError.api(let status, let code, _) where status == 409 && code == "CONFLICT" {
            env.toastCenter.show("この学期にはすでに時間割があります")
        } catch {
            env.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }

    func publish() async {
        guard let currentTimetableId else { return }
        isPublishing = true
        defer { isPublishing = false }

        do {
            _ = try await env.templateRepository.publishTimetable(id: currentTimetableId, title: currentTitle)
            env.toastCenter.show("公開しました")
        } catch {
            env.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }

    private var effectiveSemesterId: String? {
        semesterId.isEmpty ? defaultSemesterId : semesterId
    }

    func resolveCurrentTimetable() async {
        guard let target = effectiveSemesterId else {
            currentTimetableId = nil
            currentTitle = ""
            return
        }

        let timetables = (try? await env.timetableRepository.userTimetables()) ?? []
        let timetable = timetables.first { $0.semesterId == target }
        currentTimetableId = timetable?.id
        currentTitle = timetable?.title ?? ""
    }
}
