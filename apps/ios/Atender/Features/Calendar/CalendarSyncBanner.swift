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
            banner(
                icon: "calendar.badge.plus",
                iconColor: .accent500,
                title: "授業と予定を iPhone カレンダーに書き出せます",
                detail: nil,
                actionTitle: "許可",
                action: { Task { await coordinator.requestFullAccess() } },
                showsDismiss: true
            )
        case .failure(let error):
            banner(
                icon: "exclamationmark.triangle.fill",
                iconColor: .statusAbsent,
                title: error.message,
                detail: nil,
                actionTitle: error.recovery == .none ? "詳細" : error.recovery.buttonTitle,
                action: { recover(from: error.recovery) },
                showsDismiss: false
            )
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
        HStack(alignment: .top, spacing: Space.s2) {
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
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("閉じる")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.s3)
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
