import SwiftUI
import Observation

@MainActor
@Observable
final class AppRouter {
    var selectedTab: MainTab = .home
    var homePath = NavigationPath()
    var semesterPath = NavigationPath()
    var roomsPath = NavigationPath()
    var friendsPath = NavigationPath()
    var settingsPath = NavigationPath()
}
