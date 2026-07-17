import SwiftUI

enum MainTab: Int, Hashable, CaseIterable {
    case home
    case semester
    case rooms
    case friends
    case settings

    var label: String {
        switch self {
        case .home: return "ホーム"
        case .semester: return "学期・科目"
        case .rooms: return "ルーム"
        case .friends: return "友達"
        case .settings: return "設定"
        }
    }

    var symbol: String {
        switch self {
        case .home: return "calendar"
        case .semester: return "graduationcap"
        case .rooms: return "person.2"
        case .friends: return "person.crop.circle"
        case .settings: return "gearshape"
        }
    }
}

struct MainTabView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var bindableRouter = router
        TabView(selection: $bindableRouter.selectedTab) {
            NavigationStack(path: $bindableRouter.homePath) {
                HomeView()
            }
            .tabItem { Label(MainTab.home.label, systemImage: MainTab.home.symbol) }
            .tag(MainTab.home)

            NavigationStack(path: $bindableRouter.semesterPath) {
                SemesterOverviewView()
            }
            .tabItem { Label(MainTab.semester.label, systemImage: MainTab.semester.symbol) }
            .tag(MainTab.semester)

            NavigationStack(path: $bindableRouter.roomsPath) {
                RoomsView()
                    .navigationDestination(for: RoomsRoute.self) { route in
                        switch route {
                        case .detail(let id):
                            RoomDetailView(roomId: id)
                        case .join(let code):
                            JoinRoomView(inviteCode: code)
                        case .templates:
                            TemplatesView()
                        }
                    }
            }
            .tabItem { Label(MainTab.rooms.label, systemImage: MainTab.rooms.symbol) }
            .tag(MainTab.rooms)

            NavigationStack(path: $bindableRouter.friendsPath) {
                FriendsView()
                    .navigationDestination(for: FriendsRoute.self) { route in
                        switch route {
                        case .addByInvite(let code):
                            AddFriendByInviteCodeView(inviteCode: code)
                        }
                    }
            }
            .tabItem { Label(MainTab.friends.label, systemImage: MainTab.friends.symbol) }
            .tag(MainTab.friends)

            NavigationStack(path: $bindableRouter.settingsPath) {
                SettingsView()
            }
            .tabItem { Label(MainTab.settings.label, systemImage: MainTab.settings.symbol) }
            .tag(MainTab.settings)
        }
        .tabBarMinimizeOnScroll()
        .sensoryFeedback(.selection, trigger: router.selectedTab)
    }
}
