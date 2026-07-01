import SwiftUI

@main
struct AtenderApp: App {
    @State private var environment = AppEnvironment()
    @AppStorage("atender.theme") private var themePreference = ThemePreference.dark.rawValue

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .environment(environment.toastCenter)
                .environment(environment.appRouter)
                .preferredColorScheme(themePreferenceValue.colorScheme)
        }
    }

    private var themePreferenceValue: ThemePreference {
        ThemePreference(rawValue: themePreference) ?? .dark
    }
}
