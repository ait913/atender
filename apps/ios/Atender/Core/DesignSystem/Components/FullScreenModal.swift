import SwiftUI

struct FullScreenModal<Content: View>: View {
    let title: String
    @Binding var isPresented: Bool
    var onDismiss: (() -> Void)?
    @ViewBuilder var content: () -> Content

    var body: some View {
        EmptyView()
            .fullScreenCover(isPresented: $isPresented, onDismiss: onDismiss) {
                VStack(spacing: 0) {
                    HStack {
                        Button {
                            isPresented = false
                            onDismiss?()
                        } label: {
                            Image(systemName: "chevron.left")
                                .frame(width: 40, height: 40)
                        }
                        Spacer()
                        Text(title)
                            .font(.atenderBase)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.textPrimary)
                        Spacer()
                        Button {
                            isPresented = false
                            onDismiss?()
                        } label: {
                            Image(systemName: "xmark")
                                .frame(width: 40, height: 40)
                        }
                    }
                    .foregroundStyle(Color.textPrimary)
                    .padding(.horizontal, Space.s3)
                    .frame(height: Space.topbarHeightMobile)
                    .background(.ultraThinMaterial)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(Color.borderSubtle).frame(height: 1)
                    }

                    content()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .background(Color.bgBase.ignoresSafeArea())
            }
    }
}
