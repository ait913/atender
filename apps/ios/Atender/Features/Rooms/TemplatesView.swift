import SwiftUI

struct TemplatesView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var schoolId = ""
    @State private var departmentId = ""
    @State private var query = ""
    @State private var semesterId = ""
    @State private var templates: [TemplateDto] = []
    @State private var semesters: [SemesterDto] = []
    @State private var currentTimetableId: String?
    @State private var currentTitle = ""
    @State private var defaultSchoolId: String?
    @State private var defaultDepartmentId: String?
    @State private var defaultSemesterId: String?
    @State private var isPending = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s6) {
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text("みんなの時間割").font(.atender2xl).fontWeight(.bold).foregroundStyle(Color.textPrimary)
                    Text("共有テンプレ検索").font(.atenderSm).foregroundStyle(Color.textSecondary)
                }
                VStack(spacing: Space.s3) {
                    LabeledInput(label: "学校 ID", text: $schoolId)
                    LabeledInput(label: "学科 ID", text: $departmentId)
                    LabeledInput(label: "検索", text: $query)
                    Picker("学期", selection: $semesterId) {
                        Text("既定").tag("")
                        ForEach(semesters) { semester in Text(semester.name).tag(semester.id) }
                    }
                }
                AtenderButton(title: "自分の時間割を公開", variant: .primary, isLoading: isPending, isEnabled: currentTimetableId != nil && !isPending) {
                    Task { await publish() }
                }
                VStack(spacing: Space.s3) {
                    ForEach(templates) { template in
                        templateCard(template)
                    }
                }
                .accessibilityIdentifier("templates-list")
            }
            .padding(Space.pagePxMobile)
        }
        .background(Color.bgBase)
        .task { await bootstrap() }
        .task(id: "\(schoolId)-\(departmentId)-\(query)") {
            try? await Task.sleep(nanoseconds: 300_000_000)
            await search()
        }
        .onChange(of: semesterId) { _, _ in Task { await resolveCurrentTimetable() } }
    }

    private func templateCard(_ template: TemplateDto) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: Space.s2) {
                Text(template.title).font(.atenderXl).fontWeight(.semibold).foregroundStyle(Color.textPrimary)
                Text("by @\(TemplateLogic.authorHandle(template))").font(.atenderSm).foregroundStyle(Color.textSecondary)
                Text("copy x \(template.copyCount) / 更新: \(String(template.updatedAt.prefix(10)))")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
                AtenderButton(title: "コピー", variant: .primary, isEnabled: (semesterId.isEmpty ? defaultSemesterId != nil : true)) {
                    Task { await copy(template) }
                }
            }
        }
        .accessibilityIdentifier("template-card-\(template.id)")
    }

    private func bootstrap() async {
        async let me = environment.meRepository.me()
        async let sems = environment.semesterRepository.semesters()
        if let meResponse = try? await me {
            defaultSchoolId = meResponse.user.schoolId
            defaultDepartmentId = meResponse.user.departmentId
            defaultSemesterId = meResponse.user.defaultSemesterId
            schoolId = meResponse.user.schoolId ?? ""
            departmentId = meResponse.user.departmentId ?? ""
            semesterId = meResponse.user.defaultSemesterId ?? ""
        }
        semesters = (try? await sems) ?? []
        await resolveCurrentTimetable()
        await search()
    }

    private func search() async {
        templates = (try? await environment.templateRepository.templates(TemplateSearchQuery(
            schoolId: schoolId.isEmpty ? defaultSchoolId : schoolId,
            departmentId: departmentId.isEmpty ? defaultDepartmentId : departmentId,
            q: query.isEmpty ? nil : query,
            limit: 20,
            cursor: nil
        ), force: true)) ?? []
    }

    private func resolveCurrentTimetable() async {
        let target = semesterId.isEmpty ? defaultSemesterId : semesterId
        let timetables = (try? await environment.timetableRepository.userTimetables()) ?? []
        let timetable = timetables.first { $0.semesterId == target }
        currentTimetableId = timetable?.id
        currentTitle = timetable?.title ?? ""
    }

    private func copy(_ template: TemplateDto) async {
        guard let target = semesterId.isEmpty ? defaultSemesterId : semesterId else { return }
        do {
            _ = try await environment.templateRepository.copyTemplate(id: template.id, TemplateCopyInput(semesterId: target, title: nil))
            environment.toastCenter.show("コピーしました")
        } catch {
            environment.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }

    private func publish() async {
        guard let currentTimetableId else { return }
        isPending = true
        defer { isPending = false }
        do {
            _ = try await environment.templateRepository.publishTimetable(id: currentTimetableId, title: currentTitle)
            environment.toastCenter.show("公開しました")
        } catch {
            environment.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }
}
