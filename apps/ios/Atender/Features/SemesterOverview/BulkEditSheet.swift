import SwiftUI

struct BulkEditSheet: View {
    let dates: [String]
    let semesterId: String?
    let onDone: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var status: AttendanceStatus?
    @State private var overwrite = false
    @State private var reason = ""
    @State private var errorMessage: String?
    @State private var anyPending = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s5) {
            Text("\(BulkToast.formatDateList(dates)) の\(dates.count)日に一括適用")
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
            markSection
            Divider()
            clearSection
            Divider()
            suspensionSection
            if let errorMessage {
                Text(errorMessage).font(.atenderSm).foregroundStyle(Color.statusAbsent)
            }
        }
    }

    private var markSection: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("出席を一括登録").font(.atenderBase.weight(.bold)).foregroundStyle(Color.textPrimary)
            HStack(spacing: Space.s2) {
                ForEach([AttendanceStatus.present, .absent, .excused, .tardy, .earlyLeave], id: \.self) { item in
                    Button { status = item } label: {
                        Text(shortLabel(item))
                            .font(.atenderSm.weight(.bold))
                            .foregroundStyle(status == item ? Color.textOnAccent : Color.textSecondary)
                            .frame(width: 42, height: 42)
                            .background(status == item ? Color.accent500 : Color.bgMuted)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
            Toggle("記録済みも上書きする", isOn: $overwrite)
                .font(.atenderSm)
                .foregroundStyle(Color.textSecondary)
            AtenderButton(title: "この内容で登録", variant: .primary, isLoading: anyPending, isEnabled: status != nil && !anyPending) {
                Task { await bulkMark() }
            }
        }
    }

    private var clearSection: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("未記録に戻す").font(.atenderBase.weight(.bold)).foregroundStyle(Color.textPrimary)
            AtenderButton(title: "選択日の記録をすべて削除", variant: .danger, isLoading: anyPending) {
                Task { await bulkClear() }
            }
        }
    }

    private var suspensionSection: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("休講").font(.atenderBase.weight(.bold)).foregroundStyle(Color.textPrimary)
            TextField("理由", text: $reason)
                .textFieldStyle(.atender)
                .onChange(of: reason) { _, value in reason = String(value.prefix(100)) }
            HStack(spacing: Space.s3) {
                AtenderButton(title: "休講にする", variant: .secondary, isLoading: anyPending) {
                    Task { await bulkCreateSuspensions() }
                }
                AtenderButton(title: "休講を解除", variant: .ghost, isLoading: anyPending) {
                    Task { await bulkRemoveSuspensions() }
                }
            }
        }
    }

    private func bulkMark() async {
        guard let status else { return }
        await run {
            let response = try await environment.dayRepository.bulkMark(dates: dates, status: status, mode: overwrite ? .overwrite : .fill)
            environment.toastCenter.show(BulkToast.mark(upserted: response.upsertedCount, skippedExisting: response.skippedExistingCount, skippedSuspended: response.skippedSuspendedCount))
            onDone()
        }
    }

    private func bulkClear() async {
        await run {
            let response = try await environment.dayRepository.bulkClear(dates: dates)
            environment.toastCenter.show("\(response.deletedCount)件 削除しました")
            onDone()
        }
    }

    private func bulkCreateSuspensions() async {
        await run {
            let response = try await environment.dayRepository.bulkCreateTimetableSuspensions(dates: dates, reason: reason.trimmedNil)
            environment.toastCenter.show(BulkToast.createSuspensions(created: response.createdCount, skipped: response.skippedCount))
            onDone()
        }
    }

    private func bulkRemoveSuspensions() async {
        await run {
            let response = try await environment.dayRepository.bulkRemoveTimetableSuspensions(dates: dates)
            environment.toastCenter.show("\(response.removedCount)日 解除しました")
            onDone()
        }
    }

    private func run(_ operation: () async throws -> Void) async {
        anyPending = true
        errorMessage = nil
        defer { anyPending = false }
        do {
            try await operation()
        } catch {
            errorMessage = error.userFacingMessage
            environment.toastCenter.show("保存できませんでした、もう一度試してください")
        }
    }

    private func shortLabel(_ status: AttendanceStatus) -> String {
        switch status {
        case .present: return "出"
        case .absent: return "欠"
        case .excused: return "公"
        case .tardy: return "遅"
        case .earlyLeave: return "早"
        case .cancelled: return "休"
        case .unknown: return "未"
        }
    }
}

private extension String {
    var trimmedNil: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
