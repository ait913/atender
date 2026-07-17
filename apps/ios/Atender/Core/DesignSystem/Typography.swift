import SwiftUI

extension Font {
    static var atenderXs: Font { .caption2 }
    static var atenderSm: Font { .footnote }
    static var atenderBase: Font { .body }
    static var atenderLg: Font { .headline }
    static var atenderXl: Font { .title3 }
    static var atender2xl: Font { .title2 }
    static var atender3xl: Font { .title }
    static var atender5xl: Font { .largeTitle }
}

enum Leading {
    static let tight: CGFloat = 1.1
    static let snug: CGFloat = 1.2
    static let normal: CGFloat = 1.4
    static let body: CGFloat = 1.4
    static let relaxed: CGFloat = 1.5
}
