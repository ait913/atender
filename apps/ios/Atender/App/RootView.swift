import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var environment
    @AppStorage("atender.theme") private var themePreference = ThemePreference.dark.rawValue

    var body: some View {
        ZStack {
            AmbientBackground()
            Group {
                switch environment.authStore.state {
                case .unknown:
                    splash
                case .signedOut:
                    AuthView()
                case .signedIn:
                    if environment.authStore.me?.setupStatus.isComplete == false {
                        SetupFlowView()
                    } else {
                        MainTabView()
                            .environment(environment.appRouter)
                    }
                }
            }
            ToastOverlay()
        }
        .task {
            await environment.authStore.bootstrap()
        }
        .onOpenURL { url in
            environment.appRouter.handleDeepLink(url, canNavigate: canNavigate)
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL {
                environment.appRouter.handleDeepLink(url, canNavigate: canNavigate)
            }
        }
        .onChange(of: canNavigate) { _, value in
            environment.appRouter.applyPendingDeepLinkIfPossible(canNavigate: value)
        }
        .preferredColorScheme((ThemePreference(rawValue: themePreference) ?? .dark).colorScheme)
    }

    private var canNavigate: Bool {
        if case .signedIn = environment.authStore.state {
            return environment.authStore.me?.setupStatus.isComplete != false
        }
        return false
    }

    private var splash: some View {
        ZStack {
            Color.clear.ignoresSafeArea()
            ProgressView()
                .tint(.accent500)
        }
    }
}

struct SetupFlowView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var isReloading = false

    var body: some View {
        VStack(spacing: Space.s4) {
            Image(systemName: "person.crop.badge.exclamationmark")
                .font(.atender3xl)
                .foregroundStyle(Color.accent500)
            Text("初期設定 (実装予定)")
                .font(.atenderXl)
                .fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
            Text("学校・学期・時間割の初期設定フローは Phase E で実装します。")
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
    }
}
