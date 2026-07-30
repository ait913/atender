import SwiftUI

struct FullScreenModal<Content: View>: View {
    let title: String
    @Binding var isPresented: Bool
    var onDismiss: (() -> Void)?
    @ViewBuilder var content: () -> Content

    var body: some View {
        EmptyView()
            .fullScreenCover(isPresented: $isPresented, onDismiss: onDismiss) {
                NavigationStack {
                    content()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .atenderModalHeader(title: title, onClose: {
                            isPresented = false
                            onDismiss?()
                        })
                }
                .background(Color.bgBase.ignoresSafeArea())
            }
    }
}
