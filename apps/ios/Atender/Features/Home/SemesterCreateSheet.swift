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

    init(isPresented: Binding<Bool>, proposal: SemesterProposal, onCreated: @escaping (SemesterDto) async -> Void) {
        _isPresented = isPresented
        self.proposal = proposal
        self.onCreated = onCreated
        _name = State(initialValue: proposal.name)
        _startDate = State(initialValue: proposal.startDate)
        _endDate = State(initialValue: proposal.endDate)
    }

    var body: some View {
        SheetScaffold(title: "新しい学期", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                LabeledInput(label: "学期名", text: $name)
                DateStringField(label: "開始日", date: $startDate)
                DateStringField(label: "終了日", date: $endDate)
                Text("時限と表示曜日は前の学期から引き継がれます")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textSecondary)
            }
            .accessibilityIdentifier("semester-create-sheet")
        } footer: {
            HStack(spacing: Space.s3) {
                AtenderButton(title: "キャンセル", variant: .ghost, isEnabled: !isPending) { isPresented = false }
                AtenderButton(title: "学期を作成", variant: .primary, isLoading: isPending, isEnabled: canCreate && !isPending) {
                    Task { await createSemester() }
                }
            }
        }
        .interactiveDismissDisabled(isPending)
    }

    private var canCreate: Bool {
        SemesterRollover.canCreate(name: name, startDate: startDate, endDate: endDate)
    }

    private func createSemester() async {
        guard canCreate, !isPending else { return }
        isPending = true
        defer { isPending = false }
        let created: SemesterDto
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
        do {
            _ = try await environment.meRepository.updateMe(MeUpdateInput(defaultSemesterId: created.id))
        } catch {
            // 学期は作成済みなので、既定の更新に失敗してもホームへの切り替えを続ける。
            environment.toastCenter.show("既定の学期を更新できませんでした。設定の学期管理から選べます")
        }
        await onCreated(created)
        isPresented = false
    }
}
