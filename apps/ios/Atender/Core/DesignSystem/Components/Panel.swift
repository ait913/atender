import SwiftUI

struct Panel<Content: View>: View {
    var padding: CGFloat = 20
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .atenderShadow(.card)
    }
}
