import SwiftUI

struct SemesterCreateSheet: View {
    @Binding var isPresented: Bool
    let proposal: SemesterProposal
    let onCreated: (SemesterDto) async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var name: String
    @State private var startDate: String
    @State private var endDate: String
    @State private var isPending = false
    @State private var templateScope: TemplateScope?
    @State private var suggestions: [TemplateDto] = []
    @State private var selected: TemplateDto?
    @State private var showsTemplates = false
    @State private var didLoadSuggestions = false

    init(isPresented: Binding<Bool>, proposal: SemesterProposal, onCreated: @escaping (SemesterDto) async -> Void) {
        _isPresented = isPresented
        self.proposal = proposal
        self.onCreated = onCreated
        _name = State(initialValue: proposal.name)
        _startDate = State(initialValue: proposal.startDate)
        _endDate = State(initialValue: proposal.endDate)
    }

    var body: some View {
        SheetScaffold(title: "新しい学期", isPresented: guardedPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "学期名", text: $name)
                DateStringField(label: "開始日", date: $startDate)
                DateStringField(label: "終了日", date: $endDate)
                Text(selected == nil ? "時限と表示曜日は前の学期から引き継がれます" : "時限と表示曜日は取り込む時間割に合わせます")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textSecondary)
                if !suggestions.isEmpty {
                    templateSuggestionCard
                }
            }
            .accessibilityIdentifier("semester-create-sheet")
            .navigationDestination(isPresented: $showsTemplates) {
                if let templateScope {
                    TemplateBrowser(
                        purpose: .select,
                        showsFoundBanner: true,
                        initialScope: templateScope,
                        onImported: { _ in },
                        onSelected: {
                            selected = $0
                            showsTemplates = false
                        },
                        onClose: { isPresented = false }
                    )
                }
            }
        } footer: {
            HStack(spacing: Space.s3) {
                AtenderButton(title: "キャンセル", variant: .ghost, isEnabled: !isPending) { isPresented = false }
                AtenderButton(title: "学期を作成", variant: .primary, isLoading: isPending, isEnabled: canCreate && !isPending) {
                    Task { await createSemester() }
                }
            }
        }
        .interactiveDismissDisabled(isPending)
        .task { await loadSuggestions() }
    }

    private var templateSuggestionCard: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            if let selected {
                Text("取り込む: \(selected.title)")
                    .font(.atenderBase.bold())
                AtenderButton(title: "解除", variant: .ghost, size: .sm, isEnabled: !isPending) {
                    self.selected = nil
                }
                .frame(minHeight: 44)
            } else {
                Text("同じ学科の時間割が \(suggestions.count) 件見つかりました")
                    .font(.atenderBase.bold())
                AtenderButton(title: "選ぶ", variant: .secondary, size: .sm, isEnabled: !isPending) {
                    showsTemplates = true
                }
                .frame(minHeight: 44)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.s4)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: Radius.md))
        .atenderShadow(.card)
        .accessibilityIdentifier("semester-create-template-suggestion")
    }

    private func loadSuggestions() async {
        guard !didLoadSuggestions else { return }
        didLoadSuggestions = true
        guard let user = (try? await environment.meRepository.me())?.user,
              let schoolId = user.schoolId, let departmentId = user.departmentId else { return }
        let result = (try? await environment.templateRepository.templates(
            TemplateSearchQuery(schoolId: schoolId, departmentId: departmentId, q: nil, limit: 20, cursor: nil),
            force: true
        )) ?? []
        guard !Task.isCancelled else { return }
        templateScope = TemplateScope(schoolId: schoolId, departmentId: departmentId,
                                      schoolName: user.schoolName ?? "", departmentName: user.departmentName ?? "")
        suggestions = TemplateSuggestionLogic.visible(result)
    }

    // ヘッダの閉じるボタンは SheetScaffold 内で isPresented = false を直接書くため、保存中は書き込みを捨てる Binding を渡す。
    private var guardedPresented: Binding<Bool> {
        Binding(get: { isPresented }, set: { if !isPending { isPresented = $0 } })
    }

    private var canCreate: Bool {
        SemesterRollover.canCreate(name: name, startDate: startDate, endDate: endDate)
    }

    private func createSemester() async {
        guard canCreate, !isPending else { return }
        isPending = true
        defer { isPending = false }
        var created: SemesterDto?
        let steps = SemesterCreationPlan.steps(context: .rollover, createdSemesterId: nil,
                                               templateId: selected?.id, templateCopied: false)
        for step in steps {
            switch step {
            case .createSemester:
                do {
                    created = try await environment.semesterRepository.createSemester(SemesterCreateInput(
                        name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                        startDate: startDate,
                        endDate: endDate
                    ))
                } catch {
                    environment.toastCenter.show("保存できませんでした")
                    return
                }
            case .copyTemplate(let templateId):
                guard let created else { return }
                do {
                    _ = try await environment.templateRepository.copyTemplate(id: templateId,
                        TemplateCopyInput(semesterId: created.id, title: nil, replaceExisting: nil))
                } catch {
                    let status: Int?
                    switch error as? APIError {
                    case .api(let code, _, _), .http(let code): status = code
                    default: status = nil
                    }
                    // 競合は取り込み済みとして扱い、他の失敗でも既定学期の更新へ進む。
                    if status != 409 {
                        environment.toastCenter.show("学期は作成しました。時間割は「時間割の設定」から取り込めます")
                    }
                }
            case .setDefaultSemester:
                guard let created else { return }
                do {
                    _ = try await environment.meRepository.updateMe(MeUpdateInput(defaultSemesterId: created.id))
                } catch {
                    // 学期は作成済みなので、既定の更新に失敗してもホームへの切り替えを続ける。
                    environment.toastCenter.show("既定の学期を更新できませんでした。設定の学期管理から選べます")
                }
            case .refreshMe:
                break
            }
        }
        guard let created else { return }
        await onCreated(created)
        isPresented = false
    }
}
