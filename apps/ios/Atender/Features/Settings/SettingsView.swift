import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var environment
    @AppStorage("atender.theme") private var themePreference = ThemePreference.light.rawValue
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
                    ForEach(ThemePreference.allCases, id: \.rawValue) { pref in
                        Text(pref.label).tag(pref.rawValue)
                    }
                }
                .pickerStyle(.segmented)
            }
        }
        .navigationTitle("設定")
        .scrollContentBackground(.hidden)
        .background(Color.bgBase)
    }
}
