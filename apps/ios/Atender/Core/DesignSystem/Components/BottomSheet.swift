import SwiftUI

struct BottomSheet<Content: View, Footer: View>: View {
    let title: String?
    @Binding var isPresented: Bool
    var detents: Set<PresentationDetent> = [.medium, .large]
    var stackLevel: Int = 1
    var onDismiss: (() -> Void)?
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer

    var body: some View {
        EmptyView()
            .sheet(isPresented: $isPresented, onDismiss: onDismiss) {
                VStack(spacing: 0) {
                    Capsule()
                        .fill(Color.borderEmphasis)
                        .frame(width: 42, height: 5)
                        .padding(.top, Space.s2)
                        .padding(.bottom, Space.s3)
                    HStack {
                        if let title {
                            Text(title)
                                .font(.atenderLg)
                                .fontWeight(.bold)
                                .foregroundStyle(Color.textPrimary)
                        }
                        Spacer()
                        Button {
                            isPresented = false
                            onDismiss?()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.atenderSm)
                                .fontWeight(.bold)
                                .foregroundStyle(Color.textPrimary)
                                .frame(width: 36, height: 36)
                                .background(Color.textPrimary.opacity(0.08))
                                .clipShape(Circle())
                        }
                        .accessibilityIdentifier("sheet-close")
                    }
                    .padding(.horizontal, Space.s5)
                    .padding(.bottom, Space.s4)

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
                .presentationDetents(detents)
                .presentationDragIndicator(.hidden)
                .presentationBackground(Color.bgElevated)
            }
    }

    init(
        title: String?,
        isPresented: Binding<Bool>,
        detents: Set<PresentationDetent> = [.medium, .large],
        stackLevel: Int = 1,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content,
        @ViewBuilder footer: @escaping () -> Footer
    ) {
        self.title = title
        self._isPresented = isPresented
        self.detents = detents
        self.stackLevel = stackLevel
        self.onDismiss = onDismiss
        self.content = content
        self.footer = footer
    }
}

extension BottomSheet where Footer == EmptyView {
    init(
        title: String?,
        isPresented: Binding<Bool>,
        detents: Set<PresentationDetent> = [.medium, .large],
        stackLevel: Int = 1,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self._isPresented = isPresented
        self.detents = detents
        self.stackLevel = stackLevel
        self.onDismiss = onDismiss
        self.content = content
        self.footer = { EmptyView() }
    }
}
