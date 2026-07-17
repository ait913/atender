import UIKit

/// UIScreen.main is deprecated on iOS 26. Use the active window scene screen instead.
enum ScreenMetrics {
    @MainActor
    static var height: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.screen.bounds.height ?? 0
    }
}
