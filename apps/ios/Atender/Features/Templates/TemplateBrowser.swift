import SwiftUI
import Observation

@MainActor
@Observable
final class TemplateImportViewModel {
    @ObservationIgnored private let templateRepository: TemplateRepository
    @ObservationIgnored private let semesterRepository: SemesterRepository
    @ObservationIgnored private let timetableRepository: TimetableRepository
    @ObservationIgnored private let toast: (String) -> Void
    @ObservationIgnored private var pendingSemesterId: String?
    @ObservationIgnored private var pendingRetryAllowed = true

    private(set) var semesters: [SemesterDto] = []
    private(set) var timetables: [UserTimetableDto] = []
    var targetSemesterId: String?
    private(set) var isImporting = false
    private(set) var isLoaded = false
    private(set) var loadFailed = false
    private(set) var unavailableTemplateId: String?
    var pendingReplace: PendingReplace?

    struct PendingReplace: Equatable {
        let template: TemplateDto
        let semesterName: String
        let courseCount: Int
    }

    convenience init(env: AppEnvironment, initialSemesterId: String?) {
        self.init(
            templateRepository: env.templateRepository,
            semesterRepository: env.semesterRepository,
            timetableRepository: env.timetableRepository,
            initialSemesterId: initialSemesterId,
            defaultSemesterId: env.authStore.me?.user.defaultSemesterId,
            toast: { env.toastCenter.show($0) }
        )
    }

    init(templateRepository: TemplateRepository, semesterRepository: SemesterRepository,
         timetableRepository: TimetableRepository, initialSemesterId: String?,
         defaultSemesterId: String?, toast: @escaping (String) -> Void) {
        self.templateRepository = templateRepository
        self.semesterRepository = semesterRepository
        self.timetableRepository = timetableRepository
        self.targetSemesterId = initialSemesterId ?? defaultSemesterId
        self.toast = toast
    }

    func load() async {
        loadFailed = false
        isLoaded = false
        do {
            async let loadedSemesters = semesterRepository.semesters(force: true)
            async let loadedTimetables = timetableRepository.userTimetables(force: true)
            let result = try await (loadedSemesters, loadedTimetables)
            guard !Task.isCancelled else { return }
            semesters = result.0
            timetables = result.1
            if semesters.isEmpty { targetSemesterId = nil }
            else if targetSemesterId == nil { targetSemesterId = semesters.first?.id }
            isLoaded = true
        } catch {
            guard !Task.isCancelled else { return }
            loadFailed = true
        }
    }

    func requestImport(_ t: TemplateDto) async -> UserTimetableDto? {
        guard !isImporting, isLoaded, let semesterId = targetSemesterId else { return nil }
        isImporting = true
        pendingReplace = nil
        unavailableTemplateId = nil
        defer { isImporting = false }
        return await decideAndImport(t, semesterId: semesterId, retryAllowed: true)
    }

    func confirmReplace() async -> UserTimetableDto? {
        guard !isImporting, let pending = pendingReplace, let semesterId = pendingSemesterId else { return nil }
        let retryAllowed = pendingRetryAllowed
        pendingReplace = nil
        isImporting = true
        defer { isImporting = false }
        return await copy(pending.template, semesterId: semesterId,
                          decision: .confirmReplace(courseCount: pending.courseCount), retryAllowed: retryAllowed)
    }

    private func decideAndImport(_ t: TemplateDto, semesterId: String, retryAllowed: Bool) async -> UserTimetableDto? {
        let decision = TemplateImportLogic.decide(existing: timetables.first { $0.semesterId == semesterId })
        if case .confirmReplace(let count) = decision {
            // 確認中に選択先が変わっても、確認した学期だけを置換する。
            pendingSemesterId = semesterId
            pendingRetryAllowed = retryAllowed
            pendingReplace = PendingReplace(template: t, semesterName: semesters.first { $0.id == semesterId }?.name ?? "", courseCount: count)
            return nil
        }
        return await copy(t, semesterId: semesterId, decision: decision, retryAllowed: retryAllowed)
    }

    private func copy(_ t: TemplateDto, semesterId: String, decision: TemplateImportDecision,
                      retryAllowed: Bool) async -> UserTimetableDto? {
        do {
            let result = try await templateRepository.copyTemplate(id: t.id, TemplateImportLogic.copyInput(semesterId: semesterId, decision: decision))
            timetables.removeAll { $0.semesterId == semesterId }
            timetables.append(result)
            toast("「\(t.title)」を取り込みました")
            return result
        } catch {
            let status: Int?
            switch error as? APIError {
            case .api(let code, _, _), .http(let code): status = code
            default: status = nil
            }
            if status == 409, retryAllowed {
                do {
                    timetables = try await timetableRepository.userTimetables(force: true)
                } catch {
                    toast("取り込めませんでした、もう一度試してください")
                    return nil
                }
                // ダイアログをまたいでも、競合後の再判定は一度だけ。
                return await decideAndImport(t, semesterId: semesterId, retryAllowed: false)
            }
            if status == 404 {
                toast("この時間割は公開が終了しました")
                unavailableTemplateId = t.id
            } else {
                toast("取り込めませんでした、もう一度試してください")
            }
            return nil
        }
    }
}

struct TemplateBrowser: View {
    enum Purpose: Equatable {
        case importInto(initialSemesterId: String?, lockSemester: Bool)
        case select
    }

    let purpose: Purpose
    let showsFoundBanner: Bool
    let initialScope: TemplateScope
    let onImported: (UserTimetableDto) -> Void
    let onSelected: (TemplateDto) -> Void
    let onClose: () -> Void

    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var selectedScope: TemplateScope?
    @State private var templates: [TemplateDto] = []
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var loadGeneration = 0
    @State private var importModel: TemplateImportViewModel?
    @State private var pickerModel: SchoolDepartmentPickerModel?
    @State private var showsPicker = false
    @State private var preview: TemplateDto?
    @State private var showsPreview = false

    private var scope: TemplateScope { selectedScope ?? initialScope }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s4) {
                if showsFoundBanner {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Label(TemplateSuggestionLogic.foundTitle, systemImage: "checkmark")
                            .font(.atenderBase.bold())
                        Text("そのまま自分の学期に取り込めます")
                            .font(.atenderSm).foregroundStyle(Color.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Space.s4)
                    .background(Color.accent500.opacity(0.15), in: RoundedRectangle(cornerRadius: Radius.md))
                }
                if case .importInto(_, let locked) = purpose, let importModel {
                    targetPicker(importModel, locked: locked)
                }
                HStack(spacing: Space.s3) {
                    Text("\(scope.schoolName) › \(scope.departmentName)")
                        .font(.atenderSm).foregroundStyle(Color.textSecondary)
                    Spacer()
                    Button("別の学科を探す") {
                        pickerModel = SchoolDepartmentPickerModel(schoolRepository: environment.schoolRepository, allowsCreate: false)
                        showsPicker = true
                    }
                    .font(.atenderSm)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("template-browse-other")
                }
                templateList
            }
            .padding(Space.s4)
        }
        .atenderModalDetailHeader(title: "公開時間割", onBack: { dismiss() }, onClose: onClose)
        .task {
            if case .importInto(let initialId, _) = purpose, importModel == nil {
                importModel = TemplateImportViewModel(env: environment, initialSemesterId: initialId)
            }
            if let importModel, !importModel.isLoaded { await importModel.load() }
        }
        .task(id: [scope.schoolId, scope.departmentId]) { await loadTemplates() }
        .navigationDestination(isPresented: $showsPicker) {
            if let pickerModel {
                TemplateScopePickerScreen(model: pickerModel, onSelected: {
                    selectedScope = $0
                    showsPicker = false
                }, onClose: onClose)
            }
        }
        .navigationDestination(isPresented: $showsPreview) {
            if let preview {
                TemplatePreviewScreen(template: preview, purpose: purpose, importModel: importModel,
                                      onImported: onImported, onSelected: onSelected, onClose: onClose,
                                      onUnavailable: {
                    showsPreview = false
                    await loadTemplates()
                })
            }
        }
    }

    @ViewBuilder
    private func targetPicker(_ model: TemplateImportViewModel, locked: Bool) -> some View {
        let name = model.semesters.first { $0.id == model.targetSemesterId }?.name ?? ""
        if model.loadFailed {
            Text("読み込めませんでした").font(.atenderBase)
            AtenderButton(title: "再読み込み", variant: .secondary) {
                Task { await model.load() }
            }
        } else if locked {
            Text("取り込み先: \(name)").font(.atenderSm).foregroundStyle(Color.textSecondary)
        } else {
            HStack(spacing: Space.s3) {
                Text("取り込み先").font(.atenderSm)
                Menu {
                    ForEach(model.semesters) { semester in
                        Button(semester.name) { model.targetSemesterId = semester.id }
                    }
                } label: {
                    HStack(spacing: Space.s2) {
                        Text(name).font(.atenderSm.weight(.semibold)).foregroundStyle(Color.textSecondary)
                        Image(systemName: "chevron.down").font(.atenderXs).foregroundStyle(Color.textTertiary)
                    }
                    .frame(minHeight: 44)
                }
                .tint(Color.textSecondary)
                .disabled(!model.isLoaded || model.isImporting)
                .accessibilityIdentifier("template-target-semester")
            }
        }
    }

    @ViewBuilder
    private var templateList: some View {
        if isLoading {
            VStack(spacing: Space.s3) {
                ForEach(0..<3) { _ in
                    card(title: "2026 後期 情報科学科 2年", size: "8科目・週12コマ", meta: "12人が使用・2026/10/3 更新")
                        .redacted(reason: .placeholder)
                }
            }
            .accessibilityHidden(true)
        } else if loadFailed {
            Text("読み込めませんでした").font(.atenderBase)
            AtenderButton(title: "再読み込み", variant: .secondary) {
                Task { await loadTemplates() }
            }
        } else if templates.isEmpty {
            ContentUnavailableView {
                Image("mascot-hello").resizable().scaledToFit().frame(height: Space.s20)
                Text("この学科の公開時間割はまだありません").font(.atenderLg.weight(.semibold))
            } description: {
                Text("時間割を作って「みんなの時間割で公開」をオンにすると、同じ学科の人が使えるようになります")
                    .font(.atenderSm)
            }
        } else {
            LazyVStack(spacing: Space.s3) {
                ForEach(templates) { template in
                    Button {
                        preview = template
                        showsPreview = true
                    } label: {
                        card(title: template.title, size: TemplateSuggestionLogic.sizeText(template),
                             meta: TemplateSuggestionLogic.metaText(template, meId: environment.authStore.me?.user.id))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("template-card-\(template.id)")
                }
            }
        }
    }

    private func card(title: String, size: String, meta: String) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(title).font(.atenderLg.weight(.semibold)).foregroundStyle(Color.textPrimary).lineLimit(2)
            Text(size).font(.atenderSm).foregroundStyle(Color.textSecondary)
            Text(meta).font(.atenderXs).foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.s4)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: Radius.md))
        .atenderShadow(.card)
    }

    private func loadTemplates() async {
        loadGeneration += 1
        let generation = loadGeneration
        let requestedScope = scope
        isLoading = true
        loadFailed = false
        do {
            let result = try await environment.templateRepository.templates(
                TemplateSearchQuery(schoolId: requestedScope.schoolId, departmentId: requestedScope.departmentId,
                                    q: nil, limit: 20, cursor: nil), force: true)
            guard !Task.isCancelled, generation == loadGeneration, requestedScope == scope else { return }
            templates = TemplateSuggestionLogic.visible(result)
            isLoading = false
        } catch {
            guard !Task.isCancelled, generation == loadGeneration, requestedScope == scope else { return }
            loadFailed = true
            isLoading = false
        }
    }
}

private struct TemplateScopePickerScreen: View {
    @Bindable var model: SchoolDepartmentPickerModel
    let onSelected: (TemplateScope) -> Void
    let onClose: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            SchoolDepartmentPickerView(model: model).padding(Space.s4)
        }
        .atenderModalDetailHeader(title: "学校・学科", onBack: { dismiss() }, onClose: onClose)
        .onChange(of: model.department?.id) { _, _ in
            guard let school = model.school, let department = model.department else { return }
            onSelected(TemplateScope(schoolId: school.id, departmentId: department.id,
                                     schoolName: school.name, departmentName: department.name))
        }
    }
}

struct TemplatePreviewScreen: View {
    let template: TemplateDto
    let purpose: TemplateBrowser.Purpose
    let importModel: TemplateImportViewModel?
    let onImported: (UserTimetableDto) -> Void
    let onSelected: (TemplateDto) -> Void
    let onClose: () -> Void
    let onUnavailable: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var showsReplace = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s4) {
                Text(template.title).font(.atender2xl.bold()).foregroundStyle(Color.textPrimary)
                Text("\(TemplateSuggestionLogic.sizeText(template)) / \(TemplateSuggestionLogic.metaText(template, meId: environment.authStore.me?.user.id))")
                    .font(.atenderSm).foregroundStyle(Color.textSecondary)
                VStack(alignment: .leading, spacing: Space.s3) {
                    ForEach(TemplateSuggestionLogic.previewRows(template)) { row in
                        HStack(alignment: .top, spacing: Space.s3) {
                            Text(row.weekday)
                            Text(row.periodText)
                            VStack(alignment: .leading, spacing: Space.s1) {
                                Text(row.courseName)
                                if let detail = row.detail {
                                    Text(detail).font(.atenderSm).foregroundStyle(Color.textSecondary)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .font(.atenderBase)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Space.s4)
                .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: Radius.md))
                .atenderShadow(.card)
                if case .select = purpose {
                    AtenderButton(title: "この時間割を使う") { onSelected(template) }
                } else {
                    AtenderButton(title: "この学期に取り込む", isLoading: importModel?.isImporting ?? false,
                                  isEnabled: importModel?.isLoaded == true && importModel?.targetSemesterId != nil) {
                        Task {
                            guard let importModel else { return }
                            await finishImport(importModel.requestImport(template))
                        }
                    }
                    .accessibilityIdentifier("template-import-button")
                    if let importModel, importModel.isLoaded, importModel.targetSemesterId == nil {
                        Text("先に学期を作成してください").font(.atenderSm).foregroundStyle(Color.textSecondary)
                    }
                }
            }
            .padding(Space.s4)
        }
        .accessibilityIdentifier("template-preview")
        .atenderModalDetailHeader(title: "時間割の中身", onBack: { dismiss() }, onClose: onClose)
        .confirmationDialog("既存の時間割と出欠記録を置き換えます", isPresented: $showsReplace, titleVisibility: .visible) {
            Button("置き換える", role: .destructive) {
                Task {
                    guard let importModel else { return }
                    await finishImport(importModel.confirmReplace())
                }
            }
            Button("キャンセル", role: .cancel) { importModel?.pendingReplace = nil }
        } message: {
            if let pending = importModel?.pendingReplace {
                Text("「\(pending.semesterName)」の時間割（\(pending.courseCount) 科目）と、その出欠記録はすべて削除され、元に戻せません。")
            }
        }
    }

    private func finishImport(_ result: UserTimetableDto?) async {
        if let result {
            onImported(result)
        } else if importModel?.unavailableTemplateId == template.id {
            await onUnavailable()
        } else if importModel?.pendingReplace != nil {
            showsReplace = true
        }
    }
}
