import SwiftUI

struct AttendanceRuleSheet: View {
    @Binding var isPresented: Bool
    let onSaved: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var excused: RuleStrategy = .reduceDenominator
    @State private var tardy: RuleStrategy = .halfPresent
    @State private var earlyLeave: RuleStrategy = .halfPresent
    @State private var isPending = false

    var body: some View {
        SheetScaffold(title: "出欠ルール", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s4) {
                rulePicker(label: "公欠", selection: $excused)
                rulePicker(label: "遅刻", selection: $tardy)
                rulePicker(label: "早退", selection: $earlyLeave)
            }
        } footer: {
            HStack {
                Spacer()
                AtenderButton(title: "キャンセル", variant: .ghost) { isPresented = false }
                    .frame(maxWidth: 120)
                AtenderButton(title: "保存", variant: .primary, isLoading: isPending) {
                    Task { await save() }
                }
                .frame(maxWidth: 120)
            }
        }
        .accessibilityIdentifier("attendance-rule-sheet")
        .task { await load() }
        .onChange(of: isPresented) { _, open in
            if open { Task { await load() } }
        }
    }

    private func rulePicker(label: String, selection: Binding<RuleStrategy>) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(label)
                .font(.atenderXs)
                .fontWeight(.bold)
                .foregroundStyle(Color.textSecondary)
            Picker(label, selection: selection) {
                ForEach(RuleStrategyOptions.all, id: \.rawValue) { strategy in
                    Text(RuleStrategyOptions.label(strategy)).tag(strategy)
                }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Space.s3)
            .background(Color.bgMuted)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
    }

    private func load() async {
        guard let user = (try? await environment.meRepository.me())?.user else { return }
        guard let response = try? await environment.ruleRepository.attendanceRules(schoolId: user.schoolId, departmentId: user.departmentId) else { return }
        excused = response.effective.excusedStrategy
        tardy = response.effective.tardyStrategy
        earlyLeave = response.effective.earlyLeaveStrategy
    }

    private func save() async {
        guard let user = (try? await environment.meRepository.me())?.user else { return }
        isPending = true
        defer { isPending = false }
        let input = AttendanceRuleUpsertInput(excusedStrategy: excused, tardyStrategy: tardy, earlyLeaveStrategy: earlyLeave)
        do {
            _ = try await environment.ruleRepository.upsertUserRule(input, schoolId: user.schoolId, departmentId: user.departmentId)
            await onSaved()
            isPresented = false
        } catch {
            environment.toastCenter.show("保存できませんでした")
        }
    }
}

enum RuleStrategyOptions {
    static let all: [RuleStrategy] = [.countAsPresent, .countAsAbsent, .halfPresent, .reduceDenominator, .separateCount]

    static func label(_ s: RuleStrategy) -> String {
        switch s {
        case .countAsPresent: return "出席扱い"
        case .countAsAbsent: return "欠席扱い"
        case .halfPresent: return "半分出席"
        case .reduceDenominator: return "分母除外"
        case .separateCount: return "別集計"
        case .unknown: return "不明"
        }
    }
}
