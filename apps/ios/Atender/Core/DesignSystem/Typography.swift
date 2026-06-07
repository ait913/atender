import SwiftUI

// Minor Third (1.20) scale. mirror of apps/web/src/styles.css --text-* tokens.
// NOTE: Inter is not bundled in Phase iOS-1, so we use the system font at fixed sizes.
// Dynamic Type (relativeTo:) returns once Inter is bundled via Font.custom(_:size:relativeTo:).
extension Font {
    static var atenderXs: Font { .system(size: 11) }
    static var atenderSm: Font { .system(size: 13) }
    static var atenderBase: Font { .system(size: 14) }
    static var atenderLg: Font { .system(size: 17) }
    static var atenderXl: Font { .system(size: 20) }
    static var atender2xl: Font { .system(size: 24) }
    static var atender3xl: Font { .system(size: 30) }
    static var atender4xl: Font { .system(size: 36) }
    static var atender5xl: Font { .system(size: 44) }
}
