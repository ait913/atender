import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                TodayView()
            }
            .tabItem {
                Label("今日", systemImage: "checklist")
            }

            NavigationStack {
                TimetableView()
            }
            .tabItem {
                Label("時間割", systemImage: "calendar")
            }

            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("設定", systemImage: "gearshape")
            }
        }
        .tint(.accent)
    }
}
