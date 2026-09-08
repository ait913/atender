import SwiftUI
import Observation

enum FriendsRoute: Hashable {
    case addByInvite(String)
}

@MainActor
@Observable
final class AppRouter {
    var selectedTab: MainTab = .home
    var homePath = NavigationPath()
    var semesterPath = NavigationPath()
    var pendingRoomJoinCode: String?
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
            selectedTab = .home
            homePath = NavigationPath()
            pendingRoomJoinCode = code
        case .friendAdd(let code):
            selectedTab = .friends
            friendsPath.append(FriendsRoute.addByInvite(code))
        }
    }
}
