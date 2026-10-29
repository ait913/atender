import SwiftUI
import UIKit

/// 時間割のカレンダー書き出し設定シート
struct CalendarSyncSettingsSheet: View {
    @Environment(AppEnvironment.self) private var environment
    @Binding var isPresented: Bool
    @State private var isConfirmingDisable = false

    private var coordinator: CalendarSyncCoordinator { environment.calendarSyncCoordinator }

    var body: some View {
        SheetScaffold(title: "カレンダーに書き出し", isPresented: $isPresented) {
            VStack(alignment: .leading, spacing: Space.s5) {
                accessSection
                if coordinator.status.access == .fullAccess {
                    exportSection
                    statusSection
                }
            }
            .accessibilityIdentifier("calendar-export-sheet")
        } footer: {
            AtenderButton(title: "閉じる", variant: .secondary) { isPresented = false }
        }
        .task {
            coordinator.refreshAccess()
        }
        .confirmationDialog(
            "iPhone カレンダーから Atender の授業を削除します",
            isPresented: $isConfirmingDisable,
            titleVisibility: .visible
        ) {
            Button("削除する", role: .destructive) {
                Task {
                    await coordinator.setExportEnabled(false)
                    environment.toastCenter.show("iPhone カレンダーから削除しました")
                }
            }
            Button("キャンセル", role: .cancel) {}
        }
    }

    // MARK: - 権限

    private var accessSection: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            card {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("時間割の授業を iPhone の「Atender」カレンダーに書き出します。休講・振替・公欠は自動で反映されます。")
                        .font(.atenderSm)
                        .foregroundStyle(Color.textSecondary)
                    switch coordinator.status.access {
                    case .notDetermined:
                        AtenderButton(title: "iPhone カレンダーに書き出す", variant: .primary) {
                            Task {
                                await coordinator.requestFullAccess()
                            }
                        }
                    case .fullAccess:
                        Label("書き出しできます", systemImage: "checkmark.circle.fill")
                            .font(.atenderSm)
                            .foregroundStyle(Color.accent500)
                    case .writeOnly:
                        VStack(alignment: .leading, spacing: Space.s2) {
                            Text(CalendarSyncError.accessWriteOnly.message)
                                .font(.atenderXs)
                                .foregroundStyle(Color.textSecondary)
                            AtenderButton(title: "フルアクセスを要求", variant: .secondary) {
                                Task {
                                    await coordinator.requestFullAccess()
                                }
                            }
                        }
                    case .denied:
                        VStack(alignment: .leading, spacing: Space.s2) {
                            Text(CalendarSyncError.accessDenied.message)
                                .font(.atenderXs)
                                .foregroundStyle(Color.textSecondary)
                            AtenderButton(title: CalendarSyncRecovery.openSystemSettings.buttonTitle, variant: .secondary) {
                                openSystemSettings()
                            }
                        }
                    case .restricted:
                        Text(CalendarSyncError.accessRestricted.message)
                            .font(.atenderXs)
                            .foregroundStyle(Color.textSecondary)
                    }
                }
            }
        }
    }

    // MARK: - 書き出し

    private var exportSection: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            card {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Toggle("時間割を書き出す", isOn: exportEnabledBinding)
                        .font(.atenderSm)
                }
            }
            if coordinator.exportEnabled {
                Text("書き出し先: \(coordinator.status.calendarTitle ?? AtenderCalendarSpec.title)")
                    .font(.atenderXs)
                    .foregroundStyle(Color.textTertiary)
                AtenderButton(title: "今すぐ書き出す", variant: .secondary) {
                    Task {
                        await coordinator.sync(trigger: .manual)
                        if let error = coordinator.status.lastError, coordinator.status.phase == .failed {
                            environment.toastCenter.show(error.message)
                        } else {
                            let summary = coordinator.status.lastSummary ?? ExportSummary()
                            environment.toastCenter.show("書き出しました（作成 \(summary.created)・更新 \(summary.updated)・削除 \(summary.deleted)）")
                        }
                    }
                }
            }
        }
    }

    // MARK: - 同期状態

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            sectionTitle("同期状態")
            if coordinator.status.phase == .failed, let error = coordinator.status.lastError {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Label {
                        Text(error.message).font(.atenderSm).foregroundStyle(Color.statusAbsent)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color.statusAbsent)
                    }
                    if error.recovery != .none {
                        AtenderButton(title: error.recovery.buttonTitle, variant: .secondary, size: .sm) {
                            recover(from: error.recovery)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Space.s3)
                .background(Color.statusAbsent.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            } else {
                card {
                    VStack(alignment: .leading, spacing: 2) {
                        if coordinator.status.phase == .running {
                            HStack(spacing: Space.s2) {
                                ProgressView()
                                Text("書き出し中…").font(.atenderSm).foregroundStyle(Color.textSecondary)
                            }
                        } else {
                            Text(lastSuccessText).font(.atenderSm).foregroundStyle(Color.textSecondary)
                        }
                        let summary = coordinator.status.lastSummary ?? ExportSummary()
                        Text("作成 \(summary.created) ・ 更新 \(summary.updated) ・ 削除 \(summary.deleted)")
                            .font(.atenderXs)
                            .foregroundStyle(Color.textTertiary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var lastSuccessText: String {
        guard let date = coordinator.status.lastSuccessAt else { return "まだ書き出していません" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.timeZone = SchoolClock.timeZone
        formatter.dateFormat = "M/d HH:mm"
        return "最終書き出し \(formatter.string(from: date))"
    }

    // MARK: - helpers

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.atenderSm).fontWeight(.semibold).foregroundStyle(Color.textSecondary)
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Space.s3)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .atenderShadow(.card)
    }

    private var exportEnabledBinding: Binding<Bool> {
        Binding(
            get: { coordinator.exportEnabled },
            set: { value in
                if value {
                    Task { await coordinator.setExportEnabled(true) }
                } else {
                    isConfirmingDisable = true
                }
            }
        )
    }

    private func recover(from recovery: CalendarSyncRecovery) {
        switch recovery {
        case .none:
            break
        case .requestAccess:
            Task {
                await coordinator.requestFullAccess()
            }
        case .openSystemSettings:
            openSystemSettings()
        case .retry:
            Task {
                await coordinator.sync(trigger: .manual)
            }
        }
    }

    private func openSystemSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}
