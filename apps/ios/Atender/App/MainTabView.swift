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
    @State private var keyboardVisible = false

    var body: some View {
        @Bindable var bindableRouter = router
        ZStack(alignment: .bottom) {
            Group {
                switch router.selectedTab {
                case .home:
                    NavigationStack(path: $bindableRouter.homePath) {
                        HomePlaceholderView()
                    }
                case .semester:
                    NavigationStack(path: $bindableRouter.semesterPath) {
                        SemesterPlaceholderView()
                    }
                case .rooms:
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
                case .friends:
                    NavigationStack(path: $bindableRouter.friendsPath) {
                        FriendsView()
                            .navigationDestination(for: FriendsRoute.self) { route in
                                switch route {
                                case .addByInvite(let code):
                                    AddFriendByInviteCodeView(inviteCode: code)
                                }
                            }
                    }
                case .settings:
                    NavigationStack(path: $bindableRouter.settingsPath) {
                        SettingsPlaceholderView()
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if !keyboardVisible {
                BottomTabBar(selected: router.selectedTab) { tab in
                    router.selectedTab = tab
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .animation(.easeOut(duration: 0.18), value: keyboardVisible)
    }
}
