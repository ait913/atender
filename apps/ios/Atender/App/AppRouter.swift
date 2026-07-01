import SwiftUI
import Observation

enum RoomsRoute: Hashable {
    case detail(String)
    case join(String)
    case templates
}

enum FriendsRoute: Hashable {
    case addByInvite(String)
}

@MainActor
@Observable
final class AppRouter {
    var selectedTab: MainTab = .home
    var homePath = NavigationPath()
    var semesterPath = NavigationPath()
    var roomsPath = NavigationPath()
    var friendsPath = NavigationPath()
    var settingsPath = NavigationPath()
    var pendingDeepLink: DeepLink?

    func handleDeepLink(_ url: URL, canNavigate: Bool = true) {
        guard let link = DeepLink.parse(url) else { return }
        if !canNavigate {
            pendingDeepLink = link
            return
        }
        apply(link)
    }

    func applyPendingDeepLinkIfPossible(canNavigate: Bool) {
        guard canNavigate, let pendingDeepLink else { return }
        self.pendingDeepLink = nil
        apply(pendingDeepLink)
    }

    private func apply(_ link: DeepLink) {
        switch link {
        case .roomJoin(let code):
            selectedTab = .rooms
            roomsPath.append(RoomsRoute.join(code))
        case .friendAdd(let code):
            selectedTab = .friends
            friendsPath.append(FriendsRoute.addByInvite(code))
        }
    }
}
