import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        Group {
            switch environment.authStore.state {
            case .unknown:
                splash
            case .signedOut:
                AuthView()
            case .signedIn:
                if environment.authStore.me?.setupStatus.isComplete == false {
                    SetupRequiredView()
                } else {
                    MainTabView()
                }
            }
        }
        .task {
            await environment.authStore.bootstrap()
        }
        .background(Color.bgBase)
    }

    private var splash: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            ProgressView()
                .tint(.accent)
        }
    }
}

private struct SetupRequiredView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var isReloading = false

    var body: some View {
        VStack(spacing: Space.s4) {
            Image(systemName: "person.crop.badge.exclamationmark")
                .font(.atender3xl)
                .foregroundStyle(Color.accent)
            Text("初期設定が必要です")
                .font(.atenderXl.weight(.bold))
                .foregroundStyle(Color.textPrimary)
            Text("Web で学校・学期・時間割の初期設定を完了してから、もう一度読み込んでください。")
                .font(.atenderBase)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
            AtenderButton(title: "再読み込み", systemImage: "arrow.clockwise", isLoading: isReloading) {
                Task {
                    isReloading = true
                    await environment.authStore.refreshMe()
                    isReloading = false
                }
            }
        }
        .padding(Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgBase.ignoresSafeArea())
    }
}
