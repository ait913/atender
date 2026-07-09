import SwiftUI

private struct SheetContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

private struct SheetFooterHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

private struct SheetHeaderHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct BottomSheet<Content: View, Footer: View>: View {
    let title: String?
    @Binding var isPresented: Bool
    var detents: Set<PresentationDetent> = [.medium, .large]
    var stackLevel: Int = 1
    var onDismiss: (() -> Void)?
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer
    @State private var sheetPresented = false
    @State private var contentHeight: CGFloat = 0
    @State private var footerHeight: CGFloat = 0
    @State private var headerHeight: CGFloat = 0

    // 実測したヘッダ+コンテンツ+フッタ高にスナップする detent。測定前は呼び出し側 detents をフォールバックに使う。
    // 概算値を使わず全区画を実測するので、内容の短いシートは余白なく hug する。
    // 長い内容は画面の 92% で頭打ちにして内部スクロールへ委ねる。
    private var fittedDetents: Set<PresentationDetent> {
        guard contentHeight > 0, headerHeight > 0 else { return detents }
        let bottomInset: CGFloat = 8
        let screenH = UIScreen.main.bounds.height
        let target = headerHeight + contentHeight + footerHeight + bottomInset
        let capped = min(max(target, 180), screenH * 0.92)
        return [.height(capped)]
    }

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .sheet(isPresented: $sheetPresented, onDismiss: dismissBinding) {
                sheetChrome()
                    .presentationDetents(fittedDetents)
                    .presentationDragIndicator(.hidden)
                    .presentationBackground(Color.bgElevated)
            }
            .onAppear {
                guard isPresented else { return }
                Task { @MainActor in
                    sheetPresented = true
                }
            }
            .onChange(of: isPresented) { _, newValue in
                sheetPresented = newValue
            }
    }

    private func dismiss() {
        sheetPresented = false
    }

    private func dismissBinding() {
        isPresented = false
        onDismiss?()
    }

    private func sheetChrome() -> some View {
        VStack(spacing: 0) {
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
                        dismiss()
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
            }
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: SheetHeaderHeightKey.self, value: proxy.size.height)
                }
            )

            ScrollView {
                content()
                    .padding(.horizontal, Space.s5)
                    .padding(.bottom, Space.s5)
                    .background(
                        GeometryReader { proxy in
                            Color.clear.preference(key: SheetContentHeightKey.self, value: proxy.size.height)
                        }
                    )
            }

            footer()
                .padding(Space.s5)
                .background(Color.bgElevated)
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(key: SheetFooterHeightKey.self, value: proxy.size.height)
                    }
                )
        }
        .background(Color.bgElevated)
        .onPreferenceChange(SheetContentHeightKey.self) { contentHeight = $0 }
        .onPreferenceChange(SheetFooterHeightKey.self) { footerHeight = $0 }
        .onPreferenceChange(SheetHeaderHeightKey.self) { headerHeight = $0 }
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
