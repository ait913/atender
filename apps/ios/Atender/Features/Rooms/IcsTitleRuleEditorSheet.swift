import SwiftUI

struct IcsTitleRuleEditorSheet: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var isPresented: Bool
    @State private var rules: [IcsTitleRuleDto] = []
    @State private var editingId: String?
    @State private var matchType: IcsMatchType = .contains
    @State private var pattern = ""
    @State private var replaceWith = "予定"
    @State private var isPending = false

    var body: some View {
        SheetScaffold(title: "マスクルール", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s5) {
                editor
                rulesList
            }
        } footer: {
            AtenderButton(title: "閉じる", variant: .secondary) { isPresented = false }
        }
        .task { await load() }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Picker("条件", selection: $matchType) {
                Text("完全一致").tag(IcsMatchType.equals)
                Text("含む").tag(IcsMatchType.contains)
                Text("正規表現").tag(IcsMatchType.regex)
            }
            .pickerStyle(.segmented)
            LabeledInput(label: "隠したい言葉", text: $pattern)
            LabeledInput(label: "置き換え後", text: $replaceWith)
            HStack(spacing: Space.s3) {
                AtenderButton(title: editingId == nil ? "ルールを追加" : "変更を保存", variant: .primary, size: .sm, isLoading: isPending, isEnabled: !pattern.isEmpty && !isPending) {
                    Task { await save() }
                }
                if editingId != nil {
                    AtenderButton(title: "新規に戻す", variant: .ghost, size: .sm) { resetEditor() }
                }
            }
        }
    }

    private var rulesList: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("現在のルール").font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
            if rules.isEmpty {
                ContentUnavailableView("ルールはありません", systemImage: "text.badge.plus")
            } else {
                ForEach(rules) { rule in
                    HStack(spacing: Space.s3) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(label(rule.matchType)): \(rule.pattern)")
                                .font(.atenderSm)
                                .foregroundStyle(Color.textPrimary)
                            Text("→ \(rule.replaceWith ?? "予定")")
                                .font(.atenderXs)
                                .foregroundStyle(Color.textTertiary)
                        }
                        Spacer()
                        if rule.isDefault {
                            Text("既定").font(.atenderXs).foregroundStyle(Color.textTertiary)
                        } else {
                            Button("編集") { startEditing(rule) }
                                .font(.atenderXs)
                            Button("削除", role: .destructive) {
                                Task { await delete(rule) }
                            }
                            .font(.atenderXs)
                        }
                    }
                    .padding(.vertical, Space.s1)
                }
            }
        }
    }

    private func load() async {
        rules = (try? await environment.apiClient.send(Endpoints.icsTitleRules(), as: IcsTitleRulesResponse.self).rules) ?? []
    }

    private func save() async {
        isPending = true
        defer { isPending = false }
        do {
            if let editingId {
                _ = try await environment.apiClient.send(
                    Endpoints.patchIcsTitleRule(id: editingId, PatchIcsTitleRuleInput(
                        matchType: matchType,
                        pattern: pattern,
                        replaceWith: replaceWith,
                        visibilityMode: .titleMapped,
                        priority: nil
                    )),
                    as: IcsTitleRuleResponse.self
                )
            } else {
                _ = try await environment.apiClient.send(
                    Endpoints.createIcsTitleRule(CreateIcsTitleRuleInput(
                        matchType: matchType,
                        pattern: pattern,
                        replaceWith: replaceWith,
                        visibilityMode: .titleMapped,
                        priority: nil
                    )),
                    as: IcsTitleRuleResponse.self
                )
            }
            resetEditor()
            await load()
        } catch {
            environment.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }

    private func delete(_ rule: IcsTitleRuleDto) async {
        do {
            try await environment.apiClient.send(Endpoints.deleteIcsTitleRule(id: rule.id))
            await load()
        } catch {
            environment.toastCenter.show("削除できませんでした")
        }
    }

    private func startEditing(_ rule: IcsTitleRuleDto) {
        editingId = rule.id
        matchType = rule.matchType == .unknown ? .contains : rule.matchType
        pattern = rule.pattern
        replaceWith = rule.replaceWith ?? "予定"
    }

    private func resetEditor() {
        editingId = nil
        matchType = .contains
        pattern = ""
        replaceWith = "予定"
    }

    private func label(_ type: IcsMatchType) -> String {
        switch type {
        case .equals: return "完全一致"
        case .contains: return "含む"
        case .regex: return "正規表現"
        case .unknown: return "不明"
        }
    }
}
