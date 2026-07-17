import GoogleSignIn
import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var environment
    @AppStorage("atender.theme") private var themePreference = ThemePreference.light.rawValue

    var body: some View {
        ZStack {
            AmbientBackground()
            Group {
                if case let .blocked(minBuild) = environment.versionStore.state {
                    VersionGateView(currentBuild: environment.versionStore.currentBuild, minBuild: minBuild)
                } else {
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
            }
            ToastOverlay()
        }
        .task {
            await environment.authStore.bootstrap()
        }
        .task {
            await environment.versionStore.check()
        }
        .onOpenURL { url in
            if GIDSignIn.sharedInstance.handle(url) {
                return
            }
            if environment.authStore.isAuthCallback(url) {
                Task {
                    try? environment.authStore.completeTokenSignIn(callbackURL: url)
                    await environment.authStore.refreshMe()
                }
                return
            }
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
        .preferredColorScheme((ThemePreference(rawValue: themePreference) ?? .light).colorScheme)
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
