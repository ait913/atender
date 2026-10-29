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
        VStack(alignment: .leading, spacing: Space.s4) {
            if let errorText = model.errorText {
                ErrorBanner(text: errorText)
            }
            switch model.step {
            case .school, .department:
                SchoolDepartmentPickerView(model: model.picker)
                    .disabled(model.busy)
                if model.step == .department {
                    HStack(spacing: Space.s3) {
                        AtenderButton(title: "戻る", variant: .ghost, isEnabled: !model.busy && !model.picker.busy) {
                            model.step = .school
                        }
                        AtenderButton(title: "次へ", isLoading: model.busy, isEnabled: model.picker.department != nil && !model.picker.busy) {
                            Task { await model.submitDepartment() }
                        }
                    }
                }
            case .template:
                templateStep(model)
            case .semester:
                semesterStep(model)
            }
        }
    }

    private func templateStep(_ model: SetupViewModel) -> some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text("✓ \(TemplateSuggestionLogic.foundTitle)")
                .font(.atenderLg)
                .bold()
                .foregroundStyle(Color.textPrimary)
            Text("\(model.picker.school?.name ?? "") \(model.picker.department?.name ?? "") で公開されている時間割を、そのまま自分の学期に取り込めます。")
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
            ForEach(model.suggestions) { template in
                templateCard(template, model: model)
            }
            AtenderButton(title: "この時間割で進む", isEnabled: model.selectedTemplateId != nil) {
                model.step = .semester
            }
            .accessibilityIdentifier("setup-template-use")
            AtenderButton(title: "使わずに進む", variant: .secondary) {
                model.selectedTemplateId = nil
                model.step = .semester
            }
            .accessibilityIdentifier("setup-template-skip")
            AtenderButton(title: "戻る", variant: .ghost) { model.backToDepartment() }
        }
        .accessibilityIdentifier("setup-template-step")
    }

    private func templateCard(_ template: TemplateDto, model: SetupViewModel) -> some View {
        let selected = model.selectedTemplateId == template.id
        return VStack(alignment: .leading, spacing: Space.s3) {
            Button {
                model.selectedTemplateId = template.id
            } label: {
                HStack(alignment: .top, spacing: Space.s2) {
                    Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Text(template.title).font(.atenderLg)
                        Text(TemplateSuggestionLogic.sizeText(template)).font(.atenderSm)
                        Text(TemplateSuggestionLogic.metaText(template, meId: nil))
                            .font(.atenderSm)
                            .foregroundStyle(Color.textSecondary)
                    }
                }
                .foregroundStyle(Color.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected ? .isSelected : [])
            DisclosureGroup {
                VStack(alignment: .leading, spacing: Space.s3) {
                    ForEach(TemplateSuggestionLogic.previewRows(template)) { row in
                        VStack(alignment: .leading, spacing: Space.s2) {
                            Text("\(row.weekday) \(row.periodText) \(row.courseName)")
                                .foregroundStyle(Color.textPrimary)
                            if let detail = row.detail {
                                Text(detail).foregroundStyle(Color.textSecondary)
                            }
                        }
                    }
                }
                .padding(.top, Space.s2)
            } label: {
                Text("中身を見る").frame(minHeight: 44)
            }
            .font(.atenderSm)
            .tint(.textSecondary)
        }
        .padding(Space.cardPadding)
        .background(selected ? Color.accent50 : Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .stroke(selected ? Color.accent500 : Color.borderSubtle, lineWidth: 1)
        }
        .atenderShadow(.card)
        .accessibilityIdentifier("setup-template-card-\(template.id)")
    }

    private func semesterStep(_ model: SetupViewModel) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: Space.s4) {
            if let template = model.suggestions.first(where: { $0.id == model.selectedTemplateId }) {
                HStack(spacing: Space.s3) {
                    Text("取り込む時間割: \(template.title)")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textPrimary)
                    AtenderButton(title: "変更", variant: .ghost, size: .sm, isEnabled: !model.busy && model.createdSemesterId == nil) {
                        model.step = .template
                    }
                }
            }
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "名前", text: $model.semester.name)
                DateStringField(label: "開始日", date: $model.semester.startDate)
                DateStringField(label: "終了日", date: $model.semester.endDate)
            }
            .disabled(model.busy || model.createdSemesterId != nil)
            if model.copyFailed {
                ErrorBanner(text: "学期は作成しました。時間割を取り込めませんでした")
                AtenderButton(title: "もう一度", isLoading: model.busy) {
                    Task { await model.submitSemester() }
                }
                AtenderButton(title: "取り込まずに完了", variant: .secondary, isEnabled: !model.busy) {
                    model.selectedTemplateId = nil
                    Task { await model.submitSemester() }
                }
            } else {
                HStack(spacing: Space.s3) {
                    AtenderButton(title: "戻る", variant: .ghost, isEnabled: !model.busy && model.createdSemesterId == nil) {
                        if model.hasTemplateStep {
                            model.step = .template
                        } else {
                            model.backToDepartment()
                        }
                    }
                    AtenderButton(title: "完了して時間割を作る", isLoading: model.busy, isEnabled: !model.busy) {
                        Task { await model.submitSemester() }
                    }
                }
            }
        }
    }
}

enum SetupStep: Equatable { case school, department, template, semester }

@MainActor
@Observable
final class SetupViewModel {
    @ObservationIgnored private let meRepository: MeRepository
    @ObservationIgnored private let semesterRepository: SemesterRepository
    @ObservationIgnored private let templateRepository: TemplateRepository
    @ObservationIgnored private let authStore: AuthStore
    let picker: SchoolDepartmentPickerModel

    convenience init(env: AppEnvironment) {
        self.init(schoolRepository: env.schoolRepository, meRepository: env.meRepository,
                  semesterRepository: env.semesterRepository, templateRepository: env.templateRepository,
                  timetableRepository: env.timetableRepository, authStore: env.authStore)
    }

    init(schoolRepository: SchoolRepository, meRepository: MeRepository,
         semesterRepository: SemesterRepository, templateRepository: TemplateRepository,
         timetableRepository: TimetableRepository? = nil, authStore: AuthStore) {  // §8.1 のシグネチャ互換 (Setup 自体は使わない)
        picker = SchoolDepartmentPickerModel(schoolRepository: schoolRepository, allowsCreate: true)
        self.meRepository = meRepository
        self.semesterRepository = semesterRepository
        self.templateRepository = templateRepository
        self.authStore = authStore
        let proposal = SemesterRollover.initialProposal(today: SchoolClock.todayString())
        semester = SemesterDraft(name: proposal.name, startDate: proposal.startDate, endDate: proposal.endDate)
    }

    private var currentStep: SetupStep = .school
    // 学校・学科の段階は共通ピッカーを正典にし、「変更」操作にも追従する。
    var step: SetupStep {
        get {
            switch currentStep {
            case .school, .department: return picker.stage == .school ? .school : .department
            default: return currentStep
            }
        }
        set {
            if newValue == .school { picker.backToSchool() }
            currentStep = newValue
        }
    }
    var hasTemplateStep: Bool { !suggestions.isEmpty }
    private(set) var suggestions: [TemplateDto] = []
    var selectedTemplateId: String?
    var semester: SemesterDraft
    private(set) var createdSemesterId: String?
    private(set) var templateCopied = false
    private(set) var copyFailed = false
    private(set) var busy = false
    var errorText: String?

    struct SemesterDraft: Equatable {
        var name: String
        var startDate: String
        var endDate: String
    }

    var title: String {
        let total = hasTemplateStep ? 4 : 3
        switch step {
        case .school: return "Step 1/\(total): 学校を選ぶ"
        case .department: return "Step 2/\(total): 学科を選ぶ"
        case .template: return "Step 3/\(total): 時間割を選ぶ"
        case .semester: return "Step \(total)/\(total): 学期を作る"
        }
    }

    func backToDepartment() {
        guard !busy, createdSemesterId == nil else { return }
        suggestions = []
        selectedTemplateId = nil
        errorText = nil
        step = .department
    }

    func submitDepartment() async {
        guard !busy, !picker.busy, createdSemesterId == nil,
              let school = picker.school, let department = picker.department else { return }
        busy = true
        errorText = nil
        defer { busy = false }
        do {
            var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
            body.schoolId = school.id
            body.departmentId = department.id
            _ = try await meRepository.updateMe(body)
            // 提案が取得できなくても、学期作成は続けられる。
            let templates = (try? await templateRepository.templates(TemplateSearchQuery(schoolId: school.id, departmentId: department.id, limit: 20))) ?? []
            suggestions = TemplateSuggestionLogic.visible(templates)
            selectedTemplateId = nil
            step = hasTemplateStep ? .template : .semester
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func submitSemester() async {
        guard !busy, picker.school != nil, picker.department != nil else { return }
        busy = true
        errorText = nil
        copyFailed = false
        defer { busy = false }
        let plan = SemesterCreationPlan.steps(context: .onboarding, createdSemesterId: createdSemesterId,
                                              templateId: selectedTemplateId, templateCopied: templateCopied)
        do {
            for action in plan {
                switch action {
                case .createSemester:
                    let created = try await semesterRepository.createSemester(SemesterCreateInput(name: semester.name, startDate: semester.startDate, endDate: semester.endDate))
                    createdSemesterId = created.id
                case .copyTemplate(let templateId):
                    guard let createdSemesterId else { return }
                    do {
                        _ = try await templateRepository.copyTemplate(id: templateId, TemplateCopyInput(semesterId: createdSemesterId, title: nil, replaceExisting: nil))
                    } catch APIError.api(status: 409, code: _, message: _) {
                        // 応答を受け取れず再試行した場合も、取り込み済みとして続行する。
                    } catch APIError.http(status: 409) {
                        // 本文のない 409 も同じ扱いにする。
                    } catch {
                        copyFailed = true
                        return
                    }
                    templateCopied = true
                case .setDefaultSemester:
                    guard let createdSemesterId else { return }
                    var body = MeUpdateInput(schoolId: nil, departmentId: nil, defaultSemesterId: nil, name: nil, handle: nil, requiredAttendanceRate: nil)
                    body.defaultSemesterId = createdSemesterId
                    _ = try await meRepository.updateMe(body)
                case .refreshMe:
                    // 作成時点の isComplete は反映せず、取り込み・既定学期設定後にだけ遷移する。
                    await authStore.refreshMe()
                }
            }
        } catch {
            errorText = error.userFacingMessage
        }
    }
}
