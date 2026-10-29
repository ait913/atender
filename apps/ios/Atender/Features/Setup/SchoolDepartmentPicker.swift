import SwiftUI
import Observation

@MainActor
@Observable
final class SchoolDepartmentPickerModel {
    enum Stage: Equatable { case school, department }

    @ObservationIgnored private let schoolRepository: SchoolRepository
    @ObservationIgnored private var schoolSearchGeneration = 0
    @ObservationIgnored private var departmentSearchGeneration = 0

    private(set) var stage: Stage = .school
    var schoolQuery = ""
    var prefecture = ""
    var departmentQuery = ""
    private(set) var schools: [SchoolDto] = []
    private(set) var departments: [DepartmentDto] = []
    private(set) var school: SchoolDto?
    var department: DepartmentDto?
    private(set) var busy = false
    private(set) var errorText: String?
    let allowsCreate: Bool

    static let prefectures = ["", "北海道", "東京都", "千葉県", "神奈川県", "埼玉県", "大阪府", "京都府", "愛知県", "福岡県"]

    init(schoolRepository: SchoolRepository, allowsCreate: Bool) {
        self.schoolRepository = schoolRepository
        self.allowsCreate = allowsCreate
    }

    func searchSchools() async {
        guard !Task.isCancelled else { return }
        schoolSearchGeneration += 1
        let generation = schoolSearchGeneration
        let query = schoolQuery
        let selectedPrefecture = prefecture
        errorText = nil
        do {
            let result = try await schoolRepository.schools(SchoolSearchQuery(q: query.isEmpty ? nil : query, prefecture: selectedPrefecture.isEmpty ? nil : selectedPrefecture, kind: nil, limit: 20))
            guard !Task.isCancelled, generation == schoolSearchGeneration,
                  query == schoolQuery, selectedPrefecture == prefecture, stage == .school else { return }
            schools = result
        } catch {
            guard !Task.isCancelled, generation == schoolSearchGeneration,
                  query == schoolQuery, selectedPrefecture == prefecture, stage == .school else { return }
            errorText = error.userFacingMessage
        }
    }

    func selectSchool(_ school: SchoolDto) {
        schoolSearchGeneration += 1
        departmentSearchGeneration += 1
        self.school = school
        department = nil
        departmentQuery = ""
        departments = []
        errorText = nil
        stage = .department
    }

    func addSchool() async {
        guard allowsCreate, !busy, !schoolQuery.isEmpty else { return }
        busy = true
        errorText = nil
        defer { busy = false }
        do {
            let created = try await schoolRepository.createSchool(SchoolCreateInput(name: schoolQuery, nameKana: nil, kind: .other, prefecture: prefecture.isEmpty ? nil : prefecture))
            selectSchool(created)
            await loadDepartments()
        } catch {
            errorText = error.userFacingMessage
        }
    }

    func loadDepartments() async {
        guard let school, stage == .department, !Task.isCancelled else { return }
        departmentSearchGeneration += 1
        let generation = departmentSearchGeneration
        let query = departmentQuery
        errorText = nil
        do {
            let result = try await schoolRepository.departments(schoolId: school.id, q: query.isEmpty ? nil : query)
            // 学校変更前や入力変更前に始まった応答を表示しない。
            guard !Task.isCancelled, generation == departmentSearchGeneration,
                  self.school?.id == school.id, query == departmentQuery, stage == .department else { return }
            departments = result
        } catch {
            guard !Task.isCancelled, generation == departmentSearchGeneration,
                  self.school?.id == school.id, query == departmentQuery, stage == .department else { return }
            errorText = error.userFacingMessage
        }
    }

    func addDepartment() async {
        guard allowsCreate, !busy, !departmentQuery.isEmpty, let school else { return }
        busy = true
        errorText = nil
        defer { busy = false }
        do {
            let created = try await schoolRepository.createDepartment(schoolId: school.id, DepartmentCreateInput(name: departmentQuery, nameKana: nil))
            guard self.school?.id == school.id, stage == .department else { return }
            department = created
            await loadDepartments()
        } catch {
            guard self.school?.id == school.id, stage == .department else { return }
            errorText = error.userFacingMessage
        }
    }

    func backToSchool() {
        departmentSearchGeneration += 1
        stage = .school
        school = nil
        department = nil
        departments = []
        errorText = nil
    }
}

struct SchoolDepartmentPickerView: View {
    @Bindable var model: SchoolDepartmentPickerModel

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            if let errorText = model.errorText {
                ErrorBanner(text: errorText)
            }
            switch model.stage {
            case .school:
                schoolContent
            case .department:
                departmentContent
            }
        }
    }

    private var schoolContent: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            LabeledInput(label: "", text: $model.schoolQuery, placeholder: "学校名で検索")
            Picker("都道府県", selection: $model.prefecture) {
                ForEach(SchoolDepartmentPickerModel.prefectures, id: \.self) { item in
                    Text(item.isEmpty ? "都道府県" : item).tag(item)
                }
            }
            .pickerStyle(.menu)
            .task(id: [model.schoolQuery, model.prefecture]) {
                do { try await Task.sleep(nanoseconds: 300_000_000) } catch { return }
                await model.searchSchools()
            }
            VStack(spacing: Space.s2) {
                ForEach(model.schools) { school in
                    resultButton(title: "○ \(school.name)", selected: false) {
                        model.selectSchool(school)
                    }
                    .disabled(model.busy)
                }
            }
            if model.allowsCreate {
                AtenderButton(title: "＋ リストに無い学校を追加", isLoading: model.busy, isEnabled: !model.schoolQuery.isEmpty && !model.busy) {
                    Task { await model.addSchool() }
                }
            }
        }
    }

    private var departmentContent: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            HStack(spacing: Space.s3) {
                Text(model.school?.name ?? "")
                    .font(.atenderBase)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                Button("変更") { model.backToSchool() }
                    .frame(minWidth: 44, minHeight: 44)
                    .disabled(model.busy)
            }
            LabeledInput(label: "", text: $model.departmentQuery, placeholder: "\(model.school?.name ?? "") の学科名で検索")
                .task(id: [model.school?.id ?? "", model.departmentQuery]) {
                    do { try await Task.sleep(nanoseconds: 300_000_000) } catch { return }
                    await model.loadDepartments()
                }
            VStack(spacing: Space.s2) {
                ForEach(model.departments) { department in
                    resultButton(title: "○ \(department.name)", selected: model.department?.id == department.id) {
                        model.department = department
                    }
                    .disabled(model.busy)
                }
            }
            if model.allowsCreate {
                AtenderButton(title: "＋ 学科を追加", variant: .secondary, isLoading: model.busy, isEnabled: !model.departmentQuery.isEmpty && !model.busy) {
                    Task { await model.addDepartment() }
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
                .frame(minHeight: 44)
                .background(selected ? Color.accent50 : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                        .stroke(selected ? Color.accent500 : Color.borderSubtle, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }
}
