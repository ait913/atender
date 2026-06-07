import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var environment
    @AppStorage("themePreference") private var themePreference = "system"
    @State private var isSigningOut = false

    var body: some View {
        List {
            Section("アカウント") {
                LabeledContent("メール", value: environment.authStore.me?.user.email ?? "-")
                Button(role: .destructive) {
                    Task {
                        isSigningOut = true
                        await environment.authStore.signOut()
                        isSigningOut = false
                    }
                } label: {
                    HStack {
                        Text("サインアウト")
                        if isSigningOut {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isSigningOut)
            }

            Section("テーマ") {
                Picker("テーマ", selection: $themePreference) {
                    Text("System").tag("system")
                    Text("Dark").tag("dark")
                    Text("Light").tag("light")
                }
                .pickerStyle(.segmented)
            }
        }
        .navigationTitle("設定")
        .scrollContentBackground(.hidden)
        .background(Color.bgBase)
    }
}
