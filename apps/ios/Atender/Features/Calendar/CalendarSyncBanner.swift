import SwiftUI
import UIKit

/// カレンダー画面の書き出しバナー (§7.2)。成功時は何も出さない。
struct CalendarSyncBanner: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var isShowingSettings = false

    private var coordinator: CalendarSyncCoordinator { environment.calendarSyncCoordinator }

    var body: some View {
        bannerContent
            .sheet(isPresented: $isShowingSettings) {
                CalendarSyncSettingsSheet(isPresented: $isShowingSettings)
            }
    }

    @ViewBuilder
    private var bannerContent: some View {
        switch CalendarSyncBannerLogic.kind(
            status: coordinator.status,
            exportEnabled: coordinator.exportEnabled,
            promptDismissed: coordinator.promptDismissed
        ) {
        case .none:
            EmptyView()
        case .permissionPrompt:
            // ★ 文言は 1 行に収まる長さにする。折り返すとカレンダー本体の
            //   表示行数が目に見えて減る (実機 FB「スペース取りすぎ」)
            banner(
                icon: "calendar.badge.plus",
                iconColor: .accent500,
                title: "iPhone カレンダーに書き出す",
                detail: nil,
                actionTitle: "許可",
                action: { Task { await coordinator.requestFullAccess() } },
                showsDismiss: true
            )
        case .failure:
            // ★ 失敗はカレンダーの上に積まない。縦幅を食ってカレンダー本体が潰れるため、
            //   月ヘッダーの警告グリフ (CalendarSyncWarningButton) に寄せた。
            EmptyView()
        }
    }

    @ViewBuilder
    private func banner(
        icon: String,
        iconColor: Color,
        title: String,
        detail: String?,
        actionTitle: String,
        action: @escaping () -> Void,
        showsDismiss: Bool
    ) -> some View {
        HStack(alignment: .center, spacing: Space.s2) {
            Image(systemName: icon)
                .foregroundStyle(iconColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.atenderSm)
                    .foregroundStyle(Color.textPrimary)
                if let detail {
                    Text(detail)
                        .font(.atenderXs)
                        .foregroundStyle(Color.textSecondary)
                }
            }
            Spacer(minLength: Space.s2)
            AtenderButton(title: actionTitle, variant: .secondary, size: .sm, action: action)
            if showsDismiss {
                Button {
                    coordinator.promptDismissed = true
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.textTertiary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("閉じる")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Space.s3)
        .padding(.vertical, Space.s2)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .atenderShadow(.card)
    }

    private func recover(from recovery: CalendarSyncRecovery) {
        switch recovery {
        case .none:
            isShowingSettings = true
        case .requestAccess:
            Task { await coordinator.requestFullAccess() }
        case .openSystemSettings:
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        case .retry:
            Task { await coordinator.sync(trigger: .manual) }
        }
    }
}

/// 書き出し失敗を「月ヘッダーの警告グリフ」として出す。
///
/// ★ 以前は失敗もカレンダー上部のバナー (Panel) に出していたが、
///   縦幅を大きく食ってカレンダー本体が見えなくなるという実機 FB を受けて分離した。
///   詳細と復旧操作は alert に載せるので情報は落ちていない。
struct CalendarSyncWarningButton: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var isShowingDetail = false
    @State private var isShowingSettings = false

    private var coordinator: CalendarSyncCoordinator { environment.calendarSyncCoordinator }

    private var failure: CalendarSyncError? {
        if case .failure(let error) = CalendarSyncBannerLogic.kind(
            status: coordinator.status,
            exportEnabled: coordinator.exportEnabled,
            promptDismissed: coordinator.promptDismissed
        ) { return error }
        return nil
    }

    var body: some View {
        if let failure {
            Button {
                isShowingDetail = true
            } label: {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.statusAbsent)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("カレンダー書き出しのエラー")
            .accessibilityIdentifier("calendar-sync-warning")
            .alert("カレンダー書き出し", isPresented: $isShowingDetail) {
                if failure.recovery == .none {
                    Button("詳細") { isShowingSettings = true }
                } else {
                    Button(failure.recovery.buttonTitle) { recover(from: failure.recovery) }
                }
                Button("閉じる", role: .cancel) {}
            } message: {
                Text(failure.message)
            }
            .sheet(isPresented: $isShowingSettings) {
                CalendarSyncSettingsSheet(isPresented: $isShowingSettings)
            }
        }
    }

    private func recover(from recovery: CalendarSyncRecovery) {
        switch recovery {
        case .none:
            isShowingSettings = true
        case .requestAccess:
            Task { await coordinator.requestFullAccess() }
        case .openSystemSettings:
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        case .retry:
            Task { await coordinator.sync(trigger: .manual) }
        }
    }
}
