import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @AppStorage("atender.theme") private var themePreference = ThemePreference.light.rawValue
    @State private var user: UserDto?
    @State private var activeSheet: SettingsSheet?
    @State private var isSigningOut = false

    enum SettingsSheet: String, Identifiable {
        case profile, school, rules, semesters, google, requiredRate, calendar
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s4) {
                profileCard
                SettingsSection(title: "アカウント", rows: [
                    SettingsRowSpec(id: "settings-row-profile", label: "プロフィール編集") { activeSheet = .profile },
                    SettingsRowSpec(id: "settings-row-school", label: "学校・学科") { activeSheet = .school },
                ])
                SettingsSection(title: "出席", rows: [
                    SettingsRowSpec(id: "settings-row-requiredRate", label: "必要出席率", trailingText: "\(user?.requiredAttendanceRate ?? 70)%") { activeSheet = .requiredRate },
                    SettingsRowSpec(id: "settings-row-rules", label: "出欠ルール") { activeSheet = .rules },
                    SettingsRowSpec(id: "settings-row-semesters", label: "学期管理") { activeSheet = .semesters },
                ])
                SettingsSection(title: "表示") {
                    ThemeRow(selection: $themePreference)
                }
                SettingsSection(title: "カレンダー同期", rows: [
                    SettingsRowSpec(id: "settings-row-calendar", label: "iPhone のカレンダー") { activeSheet = .calendar },
                ])
                SettingsSection(title: "その他", rows: [
                    SettingsRowSpec(id: "settings-row-signout", label: "ログアウト", danger: true) {
                        Task { await signOut() }
                    },
                ])
            }
            .padding(Space.pagePxMobile)
        }
        .background(Color.bgBase)
        .navigationTitle("設定")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("settings-view")
        .task { await reloadUser() }
        .onChange(of: activeSheet) { _, value in
            if value == nil {
                Task { await reloadUser() }
            }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .profile:
                ProfileEditSheet(isPresented: activeSheetBinding, onSaved: reloadUser)
            case .school:
                SchoolDeptEditSheet(isPresented: activeSheetBinding, onSaved: reloadUser)
            case .requiredRate:
                RequiredRateSheet(isPresented: activeSheetBinding, onSaved: reloadUser)
            case .rules:
                AttendanceRuleSheet(isPresented: activeSheetBinding, onSaved: reloadUser)
            case .semesters:
                SemesterListSheet(isPresented: activeSheetBinding, onChanged: reloadUser)
            case .google:
                EmptyView()
            case .calendar:
                CalendarSyncSettingsSheet(isPresented: activeSheetBinding)
            }
        }
    }

    private var activeSheetBinding: Binding<Bool> {
        Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } })
    }

    private var profileCard: some View {
        HStack(spacing: Space.s4) {
            ZStack {
                Circle()
                    .fill(Color.accent500)
                    .atenderShadow(.glowSoft)
                if let image = user?.image, let url = URL(string: image) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            Text(SettingsLogic.avatarInitial(user))
                                .font(.atenderBase)
                                .fontWeight(.bold)
                                .foregroundStyle(Color.textOnAccent)
                        }
                    }
                    .clipShape(Circle())
                } else {
                    Text(SettingsLogic.avatarInitial(user))
                        .font(.atenderBase)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.textOnAccent)
                }
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(user?.name ?? "No name")
                    .font(.atenderSm)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                Text(user?.email ?? "")
                    .font(.atenderSm)
                    .foregroundStyle(Color.textSecondary)
                    .lineLimit(1)
                if let handle = user?.handle {
                    Text("@\(handle)")
                        .font(.atenderXs)
                        .foregroundStyle(Color.textTertiary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Space.s3)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                .stroke(Color.borderSettings, lineWidth: 1)
        }
        .atenderShadow(.settingsPanel)
    }

    private func reloadUser() async {
        user = (try? await environment.meRepository.me())?.user
    }

    private func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        // 別アカウントでログインしたときに前のアカウントの授業が残らないようにする (§7.7)
        await environment.calendarSyncCoordinator.wipeExport()
        await environment.authStore.signOut()
        environment.queryClient.removeAll()
        router.settingsPath = NavigationPath()
        isSigningOut = false
    }
}

enum SettingsLogic {
    static func avatarInitial(_ user: UserDto?) -> String {
        let source = user?.name ?? user?.email ?? "A"
        return String(source.prefix(1)).uppercased()
    }
}

private struct ThemeRow: View {
    @Binding var selection: String

    var body: some View {
        HStack(spacing: Space.s1) {
            ForEach(ThemePreference.allCases, id: \.rawValue) { preference in
                Button {
                    selection = preference.rawValue
                } label: {
                    Text(preference.label)
                        .font(.atenderXs)
                        .fontWeight(.bold)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .foregroundStyle(selection == preference.rawValue ? Color.textOnAccent : Color.textSecondary)
                        .background(selection == preference.rawValue ? Color.accent500 : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .conditional(selection == preference.rawValue) { view in
                    view.atenderShadow(.glowSoft)
                }
            }
        }
        .padding(4)
        .background(Color.bgMuted)
        .clipShape(Capsule())
        .padding(.horizontal, Space.s4)
        .padding(.vertical, Space.s3)
    }
}
