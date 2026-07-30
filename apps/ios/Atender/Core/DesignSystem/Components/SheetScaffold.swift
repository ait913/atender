import SwiftUI

struct SheetScaffold<Content: View, Footer: View>: View {
    let title: String
    @Binding var isPresented: Bool
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color.borderEmphasis)
                .frame(width: 42, height: 5)
                .padding(.top, Space.s2)
                .padding(.bottom, Space.s3)
            NavigationStack {
                VStack(spacing: 0) {
                    ScrollView {
                        content()
                            .padding(.horizontal, Space.s5)
                            .padding(.bottom, Space.s5)
                    }
                    footer()
                        .padding(Space.s5)
                        .background(Color.bgElevated)
                }
                .background(Color.bgElevated)
                .atenderModalHeader(title: title, onClose: { isPresented = false })
            }
        }
        .background(Color.bgElevated)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .presentationBackground(Color.bgElevated)
    }
}
