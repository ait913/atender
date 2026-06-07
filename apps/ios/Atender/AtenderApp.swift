import SwiftUI

@main
struct AtenderApp: App {
    @State private var environment = AppEnvironment()
    @AppStorage("themePreference") private var themePreference = "system"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .preferredColorScheme(colorScheme)
        }
    }

    private var colorScheme: ColorScheme? {
        switch themePreference {
        case "dark": return .dark
        case "light": return .light
        default: return nil
        }
    }
}
